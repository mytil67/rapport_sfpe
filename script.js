// ================================
// APPLICATION CLASS
// ================================
class ReportGenerator {
  constructor() {
    this.charts = [];
    this.currentData = null;
    this.init();
  }

  init() {
    this.setupFileUpload();
    this.setupEventListeners();
  }

  setupFileUpload() {
    const fileUploadArea = document.getElementById('fileUploadArea');
    const fileInput = document.getElementById('fileInput');

    // Click to select file
    fileUploadArea.addEventListener('click', () => {
      fileInput.click();
    });

    // File selection
    fileInput.addEventListener('change', (e) => {
      this.handleFileSelect(e.target.files[0]);
    });

    // Drag and drop
    fileUploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileUploadArea.classList.add('dragover');
    });

    fileUploadArea.addEventListener('dragleave', () => {
      fileUploadArea.classList.remove('dragover');
    });

    fileUploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      fileUploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      this.handleFileSelect(file);
    });
  }

  setupEventListeners() {
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'u': // Ctrl+U - Upload file
            e.preventDefault();
            document.getElementById('fileInput').click();
            break;
          case 'Enter': // Ctrl+Enter - Convert data
            e.preventDefault();
            this.convertData();
            break;
          case 'g': // Ctrl+G - Generate chart
            e.preventDefault();
            this.generateChart();
            break;
          case 'p': // Ctrl+P - Generate PDF
            e.preventDefault();
            this.generatePdfReport();
            break;
        }
      }
    });
  }

  async handleFileSelect(file) {
    if (!file) return;

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      this.showNotification('Format de fichier non supporté. Utilisez .xlsx, .xls ou .csv', 'error');
      return;
    }

    try {
      this.showLoading(true);
      const data = await this.readExcelFile(file);
      document.getElementById('rawExcel').value = data;
      this.convertData();
      this.showNotification('Fichier importé avec succès!', 'success');
    } catch (error) {
      console.error('Erreur lors de la lecture du fichier:', error);
      this.showNotification('Erreur lors de la lecture du fichier', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  async readExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          
          // Convert to text format
          const textData = jsonData
            .filter(row => row.length >= 2 && row[0] && row[1])
            .map(row => `${row[0]}\t${row[1]}`)
            .join('\n');
          
          resolve(textData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
      reader.readAsArrayBuffer(file);
    });
  }

  convertData() {
    const input = document.getElementById("rawExcel").value;
    if (!input.trim()) {
      this.showNotification('Aucune donnée à convertir', 'warning');
      return;
    }

    const lines = input.trim().split(/\r?\n/);
    const output = ["Établissements\tDécompte"];
    const regex = /(.+?)\s+([0-9]+(?:[,\.][0-9]+)?)\s*%?$/;

    for (let line of lines) {
      line = line.replace(/;/g, "\t");
      const match = line.match(regex);
      
      if (match) {
        const label = match[1].trim();
        const value = match[2].replace(",", ".");
        output.push(`${label}\t${value}`);
      } else {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const label = parts[0].trim();
          const value = parts[1].replace(",", ".").trim();
          if (!isNaN(parseFloat(value))) {
            output.push(`${label}\t${value}`);
          }
        }
      }
    }

    document.getElementById("excelData").value = output.join("\n");
    this.updateResultsTable();
    this.showNotification('Données converties avec succès!', 'success');
  }

  parseData(raw) {
    const rows = raw.trim().split("\n");
    const headers = rows[0].split("\t");
    const labels = [];
    const data = [];

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split("\t");
      if (cols.length >= 2) {
        const label = cols[0];
        const value = parseFloat(cols[1].replace(",", "."));
        if (!isNaN(value) && value > 0) {
          labels.push(label);
          data.push(value);
        }
      }
    }

    return { labels, data, label: headers[1] };
  }

  updateResultsTable() {
    const rawData = document.getElementById("excelData").value;
    if (!rawData.trim()) return;

    const { labels, data } = this.parseData(rawData);
    const total = data.reduce((sum, val) => sum + val, 0);

    const tableContainer = document.getElementById("resultsTableContainer");
    const tableBody = document.querySelector("#resultsTable tbody");
    
    tableBody.innerHTML = '';

    labels.forEach((label, index) => {
      const value = data[index];
      const percentage = total > 0 ? (value / total * 100).toFixed(1) : 0;
      const row = tableBody.insertRow();
      row.insertCell(0).textContent = label;
      row.insertCell(1).textContent = value;
      row.insertCell(2).textContent = `${percentage}%`;
    });

    tableContainer.style.display = 'block';
    tableContainer.classList.add('fade-in');
  }

  generateChart() {
    const rawData = document.getElementById("excelData").value;
    if (!rawData.trim()) {
      this.showNotification("Veuillez d'abord convertir les données", 'warning');
      return;
    }

    const type = document.getElementById("chartType").value;
    const { labels, data, label } = this.parseData(rawData);

    if (labels.length === 0) {
      this.showNotification("Aucune donnée valide trouvée", 'error');
      return;
    }

    this.createChart(type, labels, data, label);
    this.showNotification('Graphique ajouté avec succès!', 'success');
  }

  createChart(type, labels, data, dataLabel) {
    const chartsArea = document.getElementById("chartsArea");
    
    // Remove placeholder if it exists
    const placeholder = chartsArea.querySelector('.text-center');
    if (placeholder) {
      placeholder.remove();
    }

    const total = data.reduce((sum, val) => sum + val, 0);
    const chartId = `chart_${Date.now()}`;

    // Create chart container
    const chartContainer = document.createElement("div");
    chartContainer.className = "chart-container fade-in";
    chartContainer.dataset.chartId = chartId;

    const chartHeader = document.createElement("div");
    chartHeader.className = "chart-header";
    chartHeader.innerHTML = `
      <h3 class="chart-title">
        ${this.getChartIcon(type)} ${this.getChartTypeLabel(type)} - ${dataLabel}
      </h3>
      <button class="btn btn-danger" onclick="app.removeChart('${chartId}')">
        <i class="fas fa-times"></i>
      </button>
    `;

    const chartContent = document.createElement("div");
    chartContent.className = "chart-content";
    
    const canvas = document.createElement("canvas");
    chartContent.appendChild(canvas);
    
    chartContainer.appendChild(chartHeader);
    chartContainer.appendChild(chartContent);
    chartsArea.appendChild(chartContainer);

    // Chart configuration
    const config = {
      type: type,
      data: {
        labels: labels,
        datasets: [{
          label: dataLabel,
          data: data,
          backgroundColor: this.getColors(data.length),
          borderColor: this.getColors(data.length, true),
          borderWidth: 2,
          tension: type === 'line' ? 0.4 : 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          datalabels: {
            color: '#fff',
            anchor: type === 'pie' || type === 'doughnut' ? 'end' : 'end',
            align: type === 'pie' || type === 'doughnut' ? 'end' : 'top',
            formatter: (value) => {
              const percent = (value / total * 100).toFixed(1);
              return `${value} (${percent}%)`;
            },
            font: {
              weight: 'bold',
              size: 12
            },
            textShadowBlur: 5,
            textShadowColor: 'rgba(0, 0, 0, 0.5)'
          },
          legend: {
            labels: {
              color: '#374151',
              font: {
                size: 12
              }
            }
          },
          title: {
            display: true,
            text: `Distribution des ${dataLabel} par Établissement`,
            color: '#1f2937',
            font: {
              size: 16,
              weight: 'bold'
            }
          }
        },
        scales: this.getScaleConfig(type)
      },
      plugins: [ChartDataLabels]
    };

    const chart = new Chart(canvas, config);
    this.charts.push({ 
      chart, 
      container: chartContainer, 
      type, 
      title: `${this.getChartTypeLabel(type)} - ${dataLabel}`,
      id: chartId
    });
  }

  getChartIcon(type) {
    const icons = {
      bar: '📊',
      line: '📈',
      pie: '🥧',
      doughnut: '🍩',
      radar: '🎯'
    };
    return icons[type] || '📊';
  }

  getChartTypeLabel(type) {
    const labels = {
      bar: 'Graphique en Barres',
      line: 'Graphique Linéaire',
      pie: 'Camembert',
      doughnut: 'Graphique en Anneau',
      radar: 'Graphique Radar'
    };
    return labels[type] || 'Graphique';
  }

  getColors(count, border = false) {
    const colors = [
      border ? '#ef4444' : 'rgba(239, 68, 68, 0.8)',
      border ? '#3b82f6' : 'rgba(59, 130, 246, 0.8)',
      border ? '#10b981' : 'rgba(16, 185, 129, 0.8)',
      border ? '#f59e0b' : 'rgba(245, 158, 11, 0.8)',
      border ? '#8b5cf6' : 'rgba(139, 92, 246, 0.8)',
      border ? '#06b6d4' : 'rgba(6, 182, 212, 0.8)',
      border ? '#84cc16' : 'rgba(132, 204, 22, 0.8)',
      border ? '#f97316' : 'rgba(249, 115, 22, 0.8)',
      border ? '#ec4899' : 'rgba(236, 72, 153, 0.8)',
      border ? '#6366f1' : 'rgba(99, 102, 241, 0.8)'
    ];
    return colors.slice(0, count);
  }

  getScaleConfig(type) {
    if (type === 'pie' || type === 'doughnut' || type === 'radar') {
      return {};
    }
    
    return {
      y: {
        beginAtZero: true,
        ticks: { 
          color: '#6b7280',
          font: { size: 11 }
        },
        grid: { 
          color: 'rgba(229, 231, 235, 0.5)',
          borderColor: '#e5e7eb'
        }
      },
      x: {
        ticks: { 
          color: '#6b7280',
          font: { size: 11 }
        },
        grid: { 
          color: 'rgba(229, 231, 235, 0.5)',
          borderColor: '#e5e7eb'
        }
      }
    };
  }

  removeChart(chartId) {
    const chartContainer = document.querySelector(`[data-chart-id="${chartId}"]`);
    if (chartContainer) {
      chartContainer.remove();
      this.charts = this.charts.filter(chart => chart.id !== chartId);
      
      // Show placeholder if no charts remain
      if (this.charts.length === 0) {
        this.showChartsPlaceholder();
      }
      
      this.showNotification('Graphique supprimé', 'success');
    }
  }

  clearAllCharts() {
    if (this.charts.length === 0) {
      this.showNotification('Aucun graphique à supprimer', 'warning');
      return;
    }

    if (confirm('Êtes-vous sûr de vouloir supprimer tous les graphiques ?')) {
      this.charts.forEach(chart => chart.chart.destroy());
      this.charts = [];
      
      const chartsArea = document.getElementById("chartsArea");
      chartsArea.innerHTML = '';
      this.showChartsPlaceholder();
      
      this.showNotification('Tous les graphiques ont été supprimés', 'success');
    }
  }

  showChartsPlaceholder() {
    const chartsArea = document.getElementById("chartsArea");
    chartsArea.innerHTML = `
      <div class="text-center" style="padding: 3rem; color: var(--gray-500);">
        <i class="fas fa-chart-pie" style="font-size: 3rem; margin-bottom: 1rem;"></i>
        <p>Aucun graphique généré pour le moment</p>
        <p style="font-size: 0.875rem;">Importez vos données et cliquez sur "Ajouter un graphique"</p>
      </div>
    `;
  }

  clearData() {
    if (confirm('Êtes-vous sûr de vouloir effacer toutes les données ?')) {
      document.getElementById('rawExcel').value = '';
      document.getElementById('excelData').value = '';
      document.getElementById('resultsTableContainer').style.display = 'none';
      this.showNotification('Données effacées', 'success');
    }
  }

  async generatePdfReport() {
    if (this.charts.length === 0) {
      this.showNotification('Aucun graphique à inclure dans le rapport', 'warning');
      return;
    }

    try {
      this.showLoading(true);
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('p', 'mm', 'a4');
      const margin = 15;
      let yPos = margin;
      const pageHeight = doc.internal.pageSize.height;

      // Title Page
      this.addTitlePage(doc, margin);
      doc.addPage();
      yPos = margin;

      // Results Table
      await this.addResultsTable(doc, margin, yPos);
      
      // Charts
      await this.addChartsToPDF(doc, margin);

      // Save PDF
      const fileName = `Rapport_Enquete_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      this.showNotification('Rapport PDF généré avec succès!', 'success');
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      this.showNotification('Erreur lors de la génération du PDF', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  addTitlePage(doc, margin) {
    // Header banner
    doc.setFillColor(59, 130, 246); // Primary blue
    doc.rect(0, 0, doc.internal.pageSize.width, 50, 'F');
    
    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(255, 255, 255);
    doc.text("Rapport d'Enquête par Établissement", doc.internal.pageSize.width / 2, 25, { align: 'center' });
    
    // Subtitle
    doc.setFontSize(14);
    doc.text("Analyse des données et visualisations", doc.internal.pageSize.width / 2, 35, { align: 'center' });
    
    // Date and details
    doc.setFontSize(12);
    doc.setTextColor(107, 114, 128);
    const currentDate = new Date().toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    doc.text(`Date du rapport : ${currentDate}`, doc.internal.pageSize.width / 2, 70, { align: 'center' });
    doc.text(`Nombre de graphiques : ${this.charts.length}`, doc.internal.pageSize.width / 2, 80, { align: 'center' });
    
    // Footer
    doc.setFontSize(10);
    doc.text("Généré par le Générateur de Rapports d'Enquête", doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 20, { align: 'center' });
  }

  async addResultsTable(doc, margin, startY) {
    const tableBody = document.querySelector("#resultsTable tbody");
    const tableRows = Array.from(tableBody.querySelectorAll("tr"));

    if (tableRows.length === 0) return startY;

    doc.setFontSize(18);
    doc.setTextColor(31, 41, 55);
    doc.text("Résultats Détaillés par Établissement", margin, startY);

    const tableData = [['Établissements', 'Valeur', 'Pourcentage']];
    tableRows.forEach(row => {
      const rowCells = Array.from(row.querySelectorAll("td"));
      tableData.push(rowCells.map(cell => cell.textContent));
    });

    doc.autoTable({
      startY: startY + 10,
      head: [tableData[0]],
      body: tableData.slice(1),
      theme: 'striped',
      headStyles: { 
        fillColor: [59, 130, 246], 
        textColor: 255, 
        fontStyle: 'bold',
        fontSize: 12
      },
      styles: { 
        fontSize: 10, 
        cellPadding: 4, 
        textColor: [31, 41, 55] 
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { horizontal: margin },
      didDrawPage: function (data) {
        // Page footer
        doc.setFontSize(10);
        doc.setTextColor(107, 114, 128);
        const str = `Page ${doc.internal.getNumberOfPages()}`;
        doc.text(str, doc.internal.pageSize.width - margin, doc.internal.pageSize.height - 10, { align: 'right' });
      }
    });

    return doc.autoTable.previous.finalY + 20;
  }

  async addChartsToPDF(doc, margin) {
    doc.setFontSize(18);
    doc.setTextColor(31, 41, 55);
    doc.text("Visualisations Graphiques", margin, margin);

    let yPos = margin + 15;
    const pageHeight = doc.internal.pageSize.height;

    for (const [index, chartObj] of this.charts.entries()) {
      const canvas = chartObj.chart.canvas;
      
      try {
        const imgData = await html2canvas(canvas, { 
          backgroundColor: '#ffffff',
          scale: 2
        }).then(canvas => canvas.toDataURL('image/png'));
        
        const imgWidth = 170;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Check if new page is needed
        if (yPos + imgHeight + 30 > pageHeight) {
          doc.addPage();
          yPos = margin;
        }

        // Chart title
        doc.setFontSize(14);
        doc.setTextColor(31, 41, 55);
        doc.text(`${index + 1}. ${chartObj.title}`, margin, yPos);
        yPos += 10;

        // Add chart image
        doc.addImage(imgData, 'PNG', margin, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 20;

      } catch (error) {
        console.error('Erreur lors de l\'ajout du graphique au PDF:', error);
        // Add error message instead of chart
        doc.setFontSize(12);
        doc.setTextColor(239, 68, 68);
        doc.text(`Erreur lors du rendu du graphique: ${chartObj.title}`, margin, yPos);
        yPos += 20;
      }
    }
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
      color: white;
      border-radius: 0.75rem;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
      z-index: 1000;
      font-weight: 500;
      max-width: 400px;
      transform: translateX(400px);
      transition: transform 0.3s ease;
    `;

    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    notification.innerHTML = `${icon} ${message}`;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 100);

    // Auto remove
    setTimeout(() => {
      notification.style.transform = 'translateX(400px)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);
  }

  showLoading(show) {
    const elements = document.querySelectorAll('.btn, .form-input, .form-textarea, .form-select');
    elements.forEach(el => {
      if (show) {
        el.classList.add('loading');
      } else {
        el.classList.remove('loading');
      }
    });

    // Show/hide loading spinner
    let spinner = document.getElementById('loadingSpinner');
    if (show && !spinner) {
      spinner = document.createElement('div');
      spinner.id = 'loadingSpinner';
      spinner.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 255, 255, 0.95);
        padding: 2rem;
        border-radius: 1rem;
        box-shadow: 0 20px 25px rgba(0,0,0,0.1);
        z-index: 1001;
        text-align: center;
      `;
      spinner.innerHTML = `
        <div class="pulse" style="font-size: 2rem; margin-bottom: 1rem;">⏳</div>
        <p style="margin: 0; color: #6b7280;">Traitement en cours...</p>
      `;
      document.body.appendChild(spinner);
    } else if (!show && spinner) {
      spinner.remove();
    }
  }

  // Additional utility methods
  exportToCSV() {
    const tableBody = document.querySelector("#resultsTable tbody");
    const tableRows = Array.from(tableBody.querySelectorAll("tr"));
    
    if (tableRows.length === 0) {
      this.showNotification('Aucune donnée à exporter', 'warning');
      return;
    }

    const csvData = [['Établissements', 'Valeur', 'Pourcentage']];
    tableRows.forEach(row => {
      const rowCells = Array.from(row.querySelectorAll("td"));
      csvData.push(rowCells.map(cell => cell.textContent));
    });

    const csvContent = csvData.map(row => row.join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `donnees_enquete_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      this.showNotification('Données exportées en CSV', 'success');
    }
  }

  saveAsTemplate() {
    const rawData = document.getElementById("rawExcel").value;
    if (!rawData.trim()) {
      this.showNotification('Aucune donnée à sauvegarder', 'warning');
      return;
    }

    const template = {
      data: rawData,
      timestamp: new Date().toISOString(),
      charts: this.charts.map(chart => ({
        type: chart.type,
        title: chart.title
      }))
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `template_rapport_${new Date().toISOString().split('T')[0]}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      this.showNotification('Template sauvegardé', 'success');
    }
  }

  async loadTemplate(file) {
    try {
      const text = await file.text();
      const template = JSON.parse(text);
      
      document.getElementById('rawExcel').value = template.data;
      this.convertData();
      
      // Recreate charts
      template.charts.forEach(chartInfo => {
        document.getElementById('chartType').value = chartInfo.type;
        this.generateChart();
      });
      
      this.showNotification('Template chargé avec succès', 'success');
    } catch (error) {
      console.error('Erreur lors du chargement du template:', error);
      this.showNotification('Erreur lors du chargement du template', 'error');
    }
  }
}

// ================================
// APPLICATION INITIALIZATION
// ================================
const app = new ReportGenerator();

// Global functions for onclick handlers
window.app = app;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('Application de génération de rapports initialisée');
  
  // Add additional features buttons
  addFeatureButtons();
});

function addFeatureButtons() {
  // Add export CSV button to results table
  const tableContainer = document.getElementById('resultsTableContainer');
  if (tableContainer) {
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-secondary';
    exportBtn.innerHTML = '<i class="fas fa-download"></i> Exporter CSV';
    exportBtn.onclick = () => app.exportToCSV();
    exportBtn.style.marginTop = '1rem';
    tableContainer.appendChild(exportBtn);
  }

  // Add template functionality
  const cardBody = document.querySelector('.card-body');
  if (cardBody) {
    const templateSection = document.createElement('div');
    templateSection.className = 'btn-group';
    templateSection.style.marginTop = '1rem';
    templateSection.innerHTML = `
      <button class="btn btn-secondary" onclick="app.saveAsTemplate()">
        <i class="fas fa-save"></i> Sauvegarder Template
      </button>
      <input type="file" id="templateInput" accept=".json" style="display: none;">
      <button class="btn btn-secondary" onclick="document.getElementById('templateInput').click()">
        <i class="fas fa-upload"></i> Charger Template
      </button>
    `;
    cardBody.appendChild(templateSection);

    // Add template file handler
    document.getElementById('templateInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        app.loadTemplate(file);
      }
    });
  }
}

// Enhanced error handling
window.addEventListener('error', (event) => {
  console.error('Erreur globale:', event.error);
  if (window.app) {
    window.app.showNotification('Une erreur inattendue s\'est produite', 'error');
  }
});

// Service Worker registration for offline functionality (optional)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}
