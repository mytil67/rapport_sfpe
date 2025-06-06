// script.js - Version corrigée finale

class SurveyAnalyzer {
    constructor() {
        this.surveyData = {};
        this.rawData = [];
        this.currentEtablissement = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const fileInput = document.getElementById('file-input');
        const selectFileBtn = document.getElementById('select-file-btn');
        const uploadArea = document.getElementById('upload-area');
        const processFileBtn = document.getElementById('process-file-btn');
        const newFileBtn = document.getElementById('new-file-btn');
        const retryBtn = document.getElementById('retry-btn');
        const exportBtn = document.getElementById('export-btn');
        const modal = document.getElementById('details-modal');
        const closeModal = document.getElementById('close-modal');
        const exportPdfBtn = document.getElementById('export-pdf-btn');

        selectFileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));
        uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        processFileBtn.addEventListener('click', () => this.processFile());
        newFileBtn.addEventListener('click', () => this.resetToUpload());
        retryBtn.addEventListener('click', () => this.resetToUpload());
        exportBtn.addEventListener('click', () => this.exportResults());
        closeModal.addEventListener('click', () => this.closeModal());
        exportPdfBtn.addEventListener('click', () => this.exportCurrentEtablissementToPDF());
        
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });
    }

    handleDragOver(e) {
        e.preventDefault();
        document.getElementById('upload-area').classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        document.getElementById('upload-area').classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        document.getElementById('upload-area').classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.handleFileSelect(files[0]);
        }
    }

    handleFileSelect(file) {
        if (!file) return;

        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        
        if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
            this.showError('Veuillez sélectionner un fichier Excel (.xlsx ou .xls)');
            return;
        }

        document.getElementById('file-name').textContent = `📁 ${file.name} (${this.formatFileSize(file.size)})`;
        document.getElementById('file-info').style.display = 'block';
        this.selectedFile = file;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async processFile() {
        if (!this.selectedFile) return;

        this.showLoading('Lecture du fichier Excel...');

        try {
            const data = await this.readExcelFile(this.selectedFile);
            this.showLoading('Analyse des données...');
            
            setTimeout(() => {
                this.analyzeData(data);
                this.renderResults();
            }, 500);
            
        } catch (error) {
            console.error('Erreur lors du traitement:', error);
            this.showError(`Erreur lors du traitement du fichier: ${error.message}`);
        }
    }

    readExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error('Impossible de lire le fichier Excel'));
                }
            };
            
            reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
            reader.readAsArrayBuffer(file);
        });
    }

    analyzeData(excelData) {
        if (!excelData || excelData.length === 0) {
            throw new Error('Le fichier Excel est vide');
        }

        const headers = excelData[0];
        const rows = excelData.slice(1);
        const columnMapping = this.identifyColumns(headers);
        const responses = [];
        
        rows.forEach((row, index) => {
            if (this.isValidResponse(row)) {
                const response = this.extractResponseData(row, columnMapping, headers);
                if (response.etablissement !== "Non identifié") {
                    responses.push({
                        ...response,
                        id: index + 1
                    });
                }
            }
        });

        if (responses.length === 0) {
            throw new Error('Aucune réponse valide trouvée dans le fichier');
        }

        this.rawData = responses;
        this.calculateStatistics();
    }

    identifyColumns(headers) {
        const mapping = {};
        
        headers.forEach((header, index) => {
            const headerLower = header ? header.toString().toLowerCase() : '';
            
            if (headerLower.includes('établissement') || headerLower.includes('selectionnez')) {
                mapping.etablissement = index;
            }
            if (headerLower.includes('satisfait') && headerLower.includes('accueil')) {
                mapping.satisfaction = index;
            }
            if (headerLower.includes('vous êtes')) {
                mapping.genre = index;
            }
            if (headerLower.includes('votre âge')) {
                mapping.age = index;
            }
            if (headerLower.includes('socio-professionnelle')) {
                mapping.csp = index;
            }
            if (headerLower.includes('date de soumission')) {
                mapping.date = index;
            }
        });
        
        return mapping;
    }

    isValidResponse(row) {
        return row && row.length > 0 && row.some(cell => cell && cell.toString().trim() !== '');
    }

    extractResponseData(row, columnMapping, headers) {
        const response = {
            etablissement: "Non identifié",
            gestionnaire: "Non spécifié",
            satisfaction: "Non spécifié",
            genre: "Non spécifié",
            age: "Non spécifié",
            csp: "Non spécifié",
            date: null,
            additionalData: {}
        };

        if (columnMapping.etablissement !== undefined) {
            const etablissementValue = row[columnMapping.etablissement];
            if (etablissementValue) {
                response.etablissement = this.normalizeEtablissementName(etablissementValue.toString());
                response.gestionnaire = this.getGestionnaire(etablissementValue.toString());
            }
        }

        if (columnMapping.satisfaction !== undefined) {
            const satisfactionValue = row[columnMapping.satisfaction];
            if (satisfactionValue) {
                response.satisfaction = this.normalizeSatisfaction(satisfactionValue.toString());
            }
        }

        if (columnMapping.genre !== undefined) {
            const genreValue = row[columnMapping.genre];
            if (genreValue) {
                response.genre = genreValue.toString().includes('femme') ? 'Femme' : 
                              genreValue.toString().includes('homme') ? 'Homme' : 'Non spécifié';
            }
        }

        if (columnMapping.csp !== undefined) {
            const cspValue = row[columnMapping.csp];
            if (cspValue) {
                response.csp = this.normalizeCSP(cspValue.toString());
            }
        }

        if (columnMapping.date !== undefined) {
            const dateValue = row[columnMapping.date];
            if (dateValue) {
                response.date = this.parseDate(dateValue);
            }
        }

        headers.forEach((header, index) => {
            if (row[index] && row[index].toString().trim() !== '' && row[index] !== 'N/A') {
                const headerKey = this.normalizeHeaderKey(header);
                response.additionalData[headerKey] = row[index];
            }
        });

        return response;
    }

    normalizeHeaderKey(header) {
        if (!header) return 'unknown';
        return header.toString()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    normalizeEtablissementName(name) {
        const nameLower = name.toLowerCase();
        
        if (nameLower.includes('canardière')) return 'Crèche Canardière';
        if (nameLower.includes('montagne-verte') || nameLower.includes('montagne verte')) return 'MPE Montagne-verte';
        if (nameLower.includes('bon pasteur')) return 'Crèche Bon Pasteur';
        if (nameLower.includes('fossé') || nameLower.includes('treize')) return 'Crèche Fossé des Treize';
        if (nameLower.includes('aasbr')) return 'Crèche AASBR';
        if (nameLower.includes('ages')) return 'Crèche AGES';
        if (nameLower.includes('agf')) return 'Crèche AGF';
        if (nameLower.includes('alef')) return 'Crèche ALEF';
        if (nameLower.includes('fondation') || nameLower.includes('auteuil')) return 'Crèche Fondation d\'Auteuil';
        if (nameLower.includes('apedi')) return 'Crèche APEDI';
        
        return name;
    }

    getGestionnaire(etablissementName) {
        const nameLower = etablissementName.toLowerCase();
        
        if (nameLower.includes('ville')) return 'Ville de Strasbourg';
        if (nameLower.includes('alef')) return 'ALEF';
        if (nameLower.includes('aasbr')) return 'AASBR';
        if (nameLower.includes('ages')) return 'AGES';
        if (nameLower.includes('agf')) return 'AGF';
        if (nameLower.includes('fondation') || nameLower.includes('auteuil')) return 'Fondation d\'Auteuil';
        if (nameLower.includes('fossé') || nameLower.includes('treize')) return 'Fossé des Treize';
        if (nameLower.includes('apedi')) return 'APEDI';
        
        return 'Ville de Strasbourg';
    }

    normalizeSatisfaction(satisfaction) {
        const satLower = satisfaction.toLowerCase();
        
        if (satLower.includes('très satisfait')) return 'Très satisfait';
        if (satLower.includes('plutôt satisfait')) return 'Plutôt satisfait';
        if (satLower.includes('peu satisfait')) return 'Peu satisfait';
        if (satLower.includes('pas satisfait') || satLower.includes('non satisfait')) return 'Pas satisfait';
        
        return satisfaction;
    }

    normalizeCSP(csp) {
        const cspLower = csp.toLowerCase();
        
        if (cspLower.includes('cadre')) return 'Cadres';
        if (cspLower.includes('employé')) return 'Employés';
        if (cspLower.includes('ouvrier')) return 'Ouvriers';
        if (cspLower.includes('profession intermédiaire')) return 'Professions intermédiaires';
        if (cspLower.includes('artisan') || cspLower.includes('commerçant')) return 'Artisans/Commerçants';
        if (cspLower.includes('retraité')) return 'Retraités';
        if (cspLower.includes('sans activité') || cspLower.includes('chômage')) return 'Sans activité';
        
        return csp;
    }

    parseDate(dateValue) {
        if (!dateValue) return null;
        
        try {
            if (typeof dateValue === 'number') {
                const excelEpoch = new Date(1900, 0, 1);
                const days = dateValue - 2;
                return new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
            }
            return new Date(dateValue);
        } catch (error) {
            return null;
        }
    }

    calculateStatistics() {
        const groupedByEtablissement = {};
        
        this.rawData.forEach(response => {
            if (!groupedByEtablissement[response.etablissement]) {
                groupedByEtablissement[response.etablissement] = [];
            }
            groupedByEtablissement[response.etablissement].push(response);
        });

        this.surveyData = {};
        
        Object.entries(groupedByEtablissement).forEach(([etablissement, responses]) => {
            this.surveyData[etablissement] = this.calculateEtablissementStatistics(etablissement, responses);
        });
    }

    calculateEtablissementStatistics(etablissement, responses) {
        const stats = {
            totalReponses: responses.length,
            satisfaction: {},
            gestionnaire: {},
            genre: {},
            csp: {},
            responses: responses,
            // Nouvelles statistiques par question
            questionStats: {},
            openQuestions: {},
            closedQuestions: {}
        };

        // Statistiques de base (comme avant)
        responses.forEach(response => {
            stats.satisfaction[response.satisfaction] = (stats.satisfaction[response.satisfaction] || 0) + 1;
            stats.gestionnaire[response.gestionnaire] = (stats.gestionnaire[response.gestionnaire] || 0) + 1;
            stats.genre[response.genre] = (stats.genre[response.genre] || 0) + 1;
            stats.csp[response.csp] = (stats.csp[response.csp] || 0) + 1;
        });

        // Analyser toutes les questions pour créer des statistiques agrégées
        const allQuestions = new Set();
        
        // Collecter toutes les questions possibles
        responses.forEach(response => {
            if (response.additionalData) {
                Object.keys(response.additionalData).forEach(questionKey => {
                    allQuestions.add(questionKey);
                });
            }
        });

        // Pour chaque question, calculer les statistiques
        allQuestions.forEach(questionKey => {
            const questionData = {
                question: this.formatQuestionFromKey(questionKey),
                answers: {},
                totalResponses: 0,
                responsesList: [], // Pour les questions ouvertes
                isOpenQuestion: false
            };

            responses.forEach(response => {
                if (response.additionalData && response.additionalData[questionKey]) {
                    const answer = response.additionalData[questionKey].toString().trim();
                    
                    if (answer && answer !== 'N/A') {
                        questionData.totalResponses++;
                        
                        // Déterminer si c'est une question fermée ou ouverte
                        if (this.isClosedQuestion(answer)) {
                            const normalizedAnswer = this.normalizeClosedAnswer(answer);
                            questionData.answers[normalizedAnswer] = (questionData.answers[normalizedAnswer] || 0) + 1;
                        } else {
                            questionData.isOpenQuestion = true;
                            questionData.responsesList.push({
                                answer: answer,
                                respondentId: response.id,
                                genre: response.genre,
                                csp: response.csp
                            });
                        }
                    }
                }
            });

            if (questionData.totalResponses > 0) {
                stats.questionStats[questionKey] = questionData;
                
                if (questionData.isOpenQuestion) {
                    stats.openQuestions[questionKey] = questionData;
                } else {
                    stats.closedQuestions[questionKey] = questionData;
                }
            }
        });

        return stats;
    }

    isClosedQuestion(answer) {
        const closedAnswers = [
            'oui', 'non', 'yes', 'no',
            'très satisfait', 'plutôt satisfait', 'peu satisfait', 'pas satisfait',
            'toujours', 'souvent', 'parfois', 'jamais',
            'beaucoup', 'moyennement', 'peu', 'pas du tout',
            'excellent', 'bon', 'moyen', 'mauvais',
            'facile', 'difficile',
            'suffisant', 'insuffisant',
            'adapté', 'inadapté',
            'x', '✓', '1', '0'
        ];
        
        const answerLower = answer.toLowerCase().trim();
        
        // Vérifier si c'est une réponse fermée typique
        return closedAnswers.some(closedAnswer => 
            answerLower === closedAnswer || 
            answerLower.includes(closedAnswer)
        ) || answerLower.length < 10; // Réponses courtes = probablement fermées
    }

    normalizeClosedAnswer(answer) {
        const answerLower = answer.toLowerCase().trim();
        
        // Normaliser les réponses communes
        if (answerLower === 'oui' || answerLower === 'yes' || answerLower === 'x' || answerLower === '✓' || answerLower === '1') {
            return 'Oui';
        }
        if (answerLower === 'non' || answerLower === 'no' || answerLower === '0') {
            return 'Non';
        }
        if (answerLower.includes('très satisfait')) return 'Très satisfait';
        if (answerLower.includes('plutôt satisfait')) return 'Plutôt satisfait';
        if (answerLower.includes('peu satisfait')) return 'Peu satisfait';
        if (answerLower.includes('pas satisfait')) return 'Pas satisfait';
        if (answerLower.includes('toujours')) return 'Toujours';
        if (answerLower.includes('souvent')) return 'Souvent';
        if (answerLower.includes('parfois')) return 'Parfois';
        if (answerLower.includes('jamais')) return 'Jamais';
        
        // Capitaliser la première lettre pour les autres réponses
        return answer.charAt(0).toUpperCase() + answer.slice(1).toLowerCase();
    }

    calculateSatisfactionPercentage(satisfactionData) {
        const total = Object.values(satisfactionData).reduce((a, b) => a + b, 0);
        const satisfied = (satisfactionData["Très satisfait"] || 0) + (satisfactionData["Plutôt satisfait"] || 0);
        return total > 0 ? Math.round((satisfied / total) * 100) : 0;
    }

    getGestionnaireClass(gestionnaire) {
        const gestionnaireMap = {
            'Ville de Strasbourg': 'ville',
            'ALEF': 'alef',
            'AASBR': 'aasbr',
            'AGES': 'ages',
            'AGF': 'agf',
            'Fondation d\'Auteuil': 'fondation',
            'Fossé des Treize': 'fosse',
            'APEDI': 'apedi'
        };
        
        return gestionnaireMap[gestionnaire] || 'ville';
    }

    renderResults() {
        this.renderSummary();
        this.renderEtablissements();
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('file-upload-section').style.display = 'none';
        document.getElementById('error-message').style.display = 'none';
        document.getElementById('results').style.display = 'block';
        
        setTimeout(() => {
            document.querySelectorAll('.satisfaction-fill').forEach(bar => {
                const width = bar.style.width;
                bar.style.width = '0%';
                setTimeout(() => bar.style.width = width, 100);
            });
        }, 100);
    }

    renderSummary() {
        const totalResponses = Object.values(this.surveyData)
            .reduce((sum, data) => sum + data.totalReponses, 0);
        
        const totalEtablissements = Object.keys(this.surveyData).length;
        
        let totalSatisfied = 0;
        let totalResponsesForSatisfaction = 0;
        
        Object.values(this.surveyData).forEach(data => {
            const satisfied = (data.satisfaction["Très satisfait"] || 0) + (data.satisfaction["Plutôt satisfait"] || 0);
            totalSatisfied += satisfied;
            totalResponsesForSatisfaction += data.totalReponses;
        });
        
        const globalSatisfaction = totalResponsesForSatisfaction > 0 ? 
            Math.round((totalSatisfied / totalResponsesForSatisfaction) * 100) : 0;

        const dates = this.rawData.map(r => r.date).filter(d => d);
        let dateRange = '-';
        
        if (dates.length > 0) {
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            
            if (minDate.getTime() === maxDate.getTime()) {
                dateRange = minDate.toLocaleDateString('fr-FR');
            } else {
                dateRange = `${minDate.toLocaleDateString('fr-FR')} - ${maxDate.toLocaleDateString('fr-FR')}`;
            }
        }

        document.getElementById('total-responses').textContent = totalResponses;
        document.getElementById('total-etablissements').textContent = totalEtablissements;
        document.getElementById('satisfaction-globale').textContent = globalSatisfaction + '%';
        document.getElementById('date-enquete').textContent = dateRange;
    }

    renderEtablissements() {
        const container = document.getElementById('etablissements-container');
        container.innerHTML = '';

        Object.entries(this.surveyData).forEach(([name, data]) => {
            const satisfactionPercent = this.calculateSatisfactionPercentage(data.satisfaction);
            const gestionnaireName = Object.keys(data.gestionnaire)[0];
            const gestionnaireClass = this.getGestionnaireClass(gestionnaireName);

            const card = document.createElement('div');
            card.className = 'etablissement-card';
            
            card.innerHTML = `
                <div class="card-header ${gestionnaireClass}">
                    <h3>${name}</h3>
                    <span class="gestionnaire-badge">${gestionnaireName}</span>
                </div>
                <div class="card-content">
                    <div class="metric">
                        <div class="metric-label">📊 Satisfaction globale</div>
                        <div class="metric-value">${satisfactionPercent}%</div>
                        <div class="satisfaction-bar">
                            <div class="satisfaction-fill" style="width: ${satisfactionPercent}%"></div>
                        </div>
                    </div>
                    
                    <div class="metric">
                        <div class="metric-label">📋 Nombre de réponses</div>
                        <div class="metric-value">${data.totalReponses}</div>
                    </div>

                    <div class="details-grid">
                        <div class="detail-item">
                            <div class="detail-label">👤 Genre des répondants</div>
                            <div class="detail-value">
                                ${Object.entries(data.genre)
                                    .filter(([genre]) => genre !== 'Non spécifié')
                                    .map(([genre, count]) => `${genre}: ${count}`)
                                    .join('<br>') || 'Non spécifié'}
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">💼 Catégories socio-prof.</div>
                            <div class="detail-value">
                                ${Object.entries(data.csp)
                                    .filter(([csp]) => csp !== 'Non spécifié')
                                    .map(([csp, count]) => `${csp}: ${count}`)
                                    .join('<br>') || 'Non spécifié'}
                            </div>
                        </div>
                    </div>

                    <div class="metric">
                        <div class="metric-label">📈 Détail satisfaction</div>
                        <div style="font-size: 0.9rem; color: #666; margin-top: 5px;">
                            ${Object.entries(data.satisfaction)
                                .map(([level, count]) => `${level}: ${count} réponse${count > 1 ? 's' : ''}`)
                                .join(' • ')}
                        </div>
                    </div>

                    <div class="card-actions">
                        <button class="card-action-btn" onclick="surveyAnalyzer.showDetails('${name}')">
                            📋 Détails
                        </button>
                        <button class="card-action-btn export" onclick="surveyAnalyzer.exportEtablissementToPDF('${name}')">
                            📄 PDF
                        </button>
                    </div>
                </div>
            `;
            
            container.appendChild(card);
        });
    }

    showLoading(message) {
        document.getElementById('loading').querySelector('p').textContent = message;
        document.getElementById('loading').style.display = 'block';
        document.getElementById('file-upload-section').style.display = 'none';
        document.getElementById('error-message').style.display = 'none';
        document.getElementById('results').style.display = 'none';
    }

    showError(message) {
        document.getElementById('error-text').textContent = message;
        document.getElementById('error-message').style.display = 'block';
        document.getElementById('loading').style.display = 'none';
        document.getElementById('file-upload-section').style.display = 'none';
        document.getElementById('results').style.display = 'none';
    }

    resetToUpload() {
        this.selectedFile = null;
        this.surveyData = {};
        this.rawData = [];
        
        document.getElementById('file-input').value = '';
        document.getElementById('file-info').style.display = 'none';
        document.getElementById('file-upload-section').style.display = 'block';
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error-message').style.display = 'none';
        document.getElementById('results').style.display = 'none';
    }

    exportResults() {
        if (Object.keys(this.surveyData).length === 0) return;

        const exportData = {
            summary: {
                totalResponses: Object.values(this.surveyData).reduce((sum, data) => sum + data.totalReponses, 0),
                totalEtablissements: Object.keys(this.surveyData).length,
                exportDate: new Date().toISOString()
            },
            etablissements: this.surveyData,
            rawResponses: this.rawData
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `resultats_enquete_creches_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    }

    showDetails(etablissementName) {
        this.currentEtablissement = etablissementName;
        const data = this.surveyData[etablissementName];
        
        if (!data) return;

        document.getElementById('modal-title').textContent = `Détails - ${etablissementName}`;
        document.getElementById('details-modal').style.display = 'block';
        document.getElementById('modal-loading').style.display = 'block';
        document.getElementById('modal-content').innerHTML = '';
        
        setTimeout(() => {
            this.renderDetailedResponses(etablissementName, data);
            document.getElementById('modal-loading').style.display = 'none';
        }, 500);
    }

    renderDetailedResponses(etablissementName, data) {
        const container = document.getElementById('modal-content');
        
        // Statistiques générales
        const summaryHtml = `
            <div class="response-item" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; border: none;">
                <h3 style="margin: 0 0 15px 0;">📊 Résumé pour ${etablissementName}</h3>
                <div class="response-header" style="border-bottom: 1px solid rgba(255,255,255,0.3);">
                    <div class="response-field">
                        <div class="response-field-label" style="color: rgba(255,255,255,0.8);">Total réponses</div>
                        <div class="response-field-value" style="color: white;">${data.totalReponses}</div>
                    </div>
                    <div class="response-field">
                        <div class="response-field-label" style="color: rgba(255,255,255,0.8);">Gestionnaire</div>
                        <div class="response-field-value" style="color: white;">${Object.keys(data.gestionnaire)[0]}</div>
                    </div>
                    <div class="response-field">
                        <div class="response-field-label" style="color: rgba(255,255,255,0.8);">Satisfaction</div>
                        <div class="response-field-value" style="color: white;">${this.calculateSatisfactionPercentage(data.satisfaction)}%</div>
                    </div>
                </div>
            </div>
        `;

        // Questions fermées - Statistiques agrégées
        let closedQuestionsHtml = '';
        if (data.closedQuestions && Object.keys(data.closedQuestions).length > 0) {
            closedQuestionsHtml = `
                <div class="response-item" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); color: white; border: none; margin-bottom: 20px;">
                    <h3 style="margin: 0 0 15px 0;">📊 Questions fermées - Statistiques</h3>
                </div>
            `;

            Object.entries(data.closedQuestions).forEach(([questionKey, questionData]) => {
                const percentages = this.calculatePercentages(questionData.answers, questionData.totalResponses);
                
                closedQuestionsHtml += `
                    <div class="response-item">
                        <h4 style="color: #4facfe; margin-bottom: 15px;">${questionData.question}</h4>
                        <div style="margin-bottom: 10px; font-size: 0.9rem; color: #666;">
                            ${questionData.totalResponses} réponse${questionData.totalResponses > 1 ? 's' : ''}
                        </div>
                        <div class="question-stats">
                            ${Object.entries(percentages).map(([answer, data]) => `
                                <div class="stat-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 8px; background: #f8f9fa; border-radius: 5px;">
                                    <span style="font-weight: 500;">${answer}</span>
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <div class="mini-bar" style="width: 100px; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
                                            <div style="width: ${data.percentage}%; height: 100%; background: linear-gradient(90deg, #4facfe, #00f2fe); transition: width 0.5s ease;"></div>
                                        </div>
                                        <span style="font-weight: bold; min-width: 50px; text-align: right;">${data.count} (${data.percentage}%)</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });
        }

        // Questions ouvertes - Liste des réponses
        let openQuestionsHtml = '';
        if (data.openQuestions && Object.keys(data.openQuestions).length > 0) {
            openQuestionsHtml = `
                <div class="response-item" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white; border: none; margin-bottom: 20px;">
                    <h3 style="margin: 0 0 15px 0;">💬 Questions ouvertes - Réponses</h3>
                </div>
            `;

            Object.entries(data.openQuestions).forEach(([questionKey, questionData]) => {
                openQuestionsHtml += `
                    <div class="response-item">
                        <h4 style="color: #fa709a; margin-bottom: 15px;">${questionData.question}</h4>
                        <div style="margin-bottom: 15px; font-size: 0.9rem; color: #666;">
                            ${questionData.responsesList.length} réponse${questionData.responsesList.length > 1 ? 's' : ''}
                        </div>
                        <div class="open-responses">
                            ${questionData.responsesList.map((responseItem, index) => `
                                <div class="open-response-item" style="margin-bottom: 12px; padding: 12px; background: #f8f9fa; border-left: 3px solid #fa709a; border-radius: 0 5px 5px 0;">
                                    <div class="response-text" style="margin-bottom: 8px; font-style: italic;">
                                        "${responseItem.answer}"
                                    </div>
                                    <div class="response-meta" style="font-size: 0.8rem; color: #666;">
                                        Répondant #${responseItem.respondentId} - ${responseItem.genre}, ${responseItem.csp}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });
        }

        // Affichage final
        let finalHtml = summaryHtml;
        
        if (closedQuestionsHtml) {
            finalHtml += closedQuestionsHtml;
        }
        
        if (openQuestionsHtml) {
            finalHtml += openQuestionsHtml;
        }
        
        // Si pas de questions détaillées, afficher un message
        if (!closedQuestionsHtml && !openQuestionsHtml) {
            finalHtml += `
                <div class="response-item">
                    <h4>📋 Données disponibles</h4>
                    <p>Les statistiques de base sont disponibles. Les questions détaillées du questionnaire peuvent être analysées en chargeant un fichier Excel avec plus de colonnes de données.</p>
                </div>
            `;
        }

        container.innerHTML = finalHtml;
    }

    calculatePercentages(answers, total) {
        const percentages = {};
        
        Object.entries(answers).forEach(([answer, count]) => {
            percentages[answer] = {
                count: count,
                percentage: Math.round((count / total) * 100)
            };
        });
        
        return percentages;
    }

    renderDetailedQuestions(response) {
        const questions = this.extractQuestionsFromResponse(response);
        
        if (questions.length === 0) {
            return `
                <div class="response-details">
                    <h4>📝 Réponses détaillées</h4>
                    <div class="question-item">
                        <div class="question-label">Données disponibles</div>
                        <div class="question-answer">
                            Cette réponse contient les informations de base (établissement, satisfaction, profil du répondant).
                            Les données détaillées du questionnaire original peuvent être ajoutées ici.
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="response-details">
                <h4>📝 Réponses détaillées</h4>
                <div class="response-questions">
                    ${questions.map(q => `
                        <div class="question-item">
                            <div class="question-label">${q.question}</div>
                            <div class="question-answer ${q.highlighted ? 'highlighted' : ''}">${q.answer}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    extractQuestionsFromResponse(response) {
        const questions = [];
        
        questions.push({
            question: "Êtes-vous satisfait(e) de l'accueil de votre enfant à la crèche ?",
            answer: response.satisfaction,
            highlighted: response.satisfaction.includes('satisfait')
        });

        questions.push({
            question: "Votre profil",
            answer: `${response.genre}, ${response.csp}`,
            highlighted: false
        });

        if (response.additionalData) {
            Object.entries(response.additionalData).forEach(([key, value]) => {
                if (value && value.toString().trim() !== '' && value !== 'N/A') {
                    questions.push({
                        question: this.formatQuestionFromKey(key),
                        answer: value.toString(),
                        highlighted: this.isImportantAnswer(key, value)
                    });
                }
            });
        }

        return questions;
    }

    formatQuestionFromKey(key) {
        const questionMap = {
            'besoins': 'L\'accueil prend-il en compte les besoins de votre enfant ?',
            'confiance': 'Une relation de confiance s\'est-elle construite avec l\'équipe ?',
            'communication': 'La communication avec l\'équipe est-elle satisfaisante ?',
            'accompagnement': 'L\'accompagnement éducatif vous convient-il ?',
            'environnement': 'L\'environnement de la crèche est-il adapté ?',
            'remarques': 'Remarques et suggestions complémentaires'
        };
        
        return questionMap[key] || key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
    }

    isImportantAnswer(key, value) {
        const importantKeys = ['remarques', 'suggestions', 'problemes'];
        const negativeWords = ['non', 'pas', 'peu', 'difficile', 'problème'];
        
        return importantKeys.some(k => key.toLowerCase().includes(k)) ||
               negativeWords.some(w => value.toString().toLowerCase().includes(w));
    }

    closeModal() {
        document.getElementById('details-modal').style.display = 'none';
        this.currentEtablissement = null;
    }

    exportEtablissementToPDF(etablissementName) {
        this.currentEtablissement = etablissementName;
        this.exportCurrentEtablissementToPDF();
    }

    exportCurrentEtablissementToPDF() {
        if (!this.currentEtablissement || !this.surveyData[this.currentEtablissement]) {
            console.error('Aucun établissement sélectionné pour l\'export');
            return;
        }

        const etablissement = this.currentEtablissement;
        const data = this.surveyData[etablissement];
        const gestionnaire = Object.keys(data.gestionnaire)[0];
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const primaryColor = [79, 172, 254];
        const secondaryColor = [240, 147, 251];
        const successColor = [67, 233, 123];
        const warningColor = [250, 112, 154];
        const textColor = [51, 51, 51];
        
        let yPosition = 20;
        
        // En-tête
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 210, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('Rapport statistique d\'enquête', 105, 20, { align: 'center' });
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text(`${etablissement}`, 105, 30, { align: 'center' });
        
        yPosition = 60;
        
        // Informations générales
        this.addPDFSection(doc, 'Informations générales', yPosition, primaryColor, textColor);
        yPosition += 20;
        
        const generalInfo = [
            `Établissement: ${etablissement}`,
            `Gestionnaire: ${gestionnaire}`,
            `Nombre de réponses: ${data.totalReponses}`,
            `Satisfaction globale: ${this.calculateSatisfactionPercentage(data.satisfaction)}%`,
            `Date du rapport: ${new Date().toLocaleDateString('fr-FR')}`
        ];
        
        yPosition = this.addPDFList(doc, generalInfo, yPosition, textColor);
        yPosition += 15;
        
        // Section questions fermées
        if (data.closedQuestions && Object.keys(data.closedQuestions).length > 0) {
            yPosition = this.checkPageBreak(doc, yPosition, 60);
            this.addPDFSection(doc, 'Questions fermées - Statistiques', yPosition, successColor, textColor);
            yPosition += 20;
            
            Object.entries(data.closedQuestions).forEach(([questionKey, questionData]) => {
                yPosition = this.checkPageBreak(doc, yPosition, 50);
                
                // Titre de la question
                doc.setTextColor(...textColor);
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                const questionLines = doc.splitTextToSize(questionData.question, 170);
                questionLines.forEach(line => {
                    doc.text(line, 20, yPosition);
                    yPosition += 6;
                });
                
                doc.setFontSize(9);
                doc.setFont('helvetica', 'italic');
                doc.text(`${questionData.totalResponses} réponse${questionData.totalResponses > 1 ? 's' : ''}`, 20, yPosition);
                yPosition += 10;
                
                // Statistiques
                const percentages = this.calculatePercentages(questionData.answers, questionData.totalResponses);
                Object.entries(percentages).forEach(([answer, data]) => {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(10);
                    doc.text(`${answer}: ${data.count} (${data.percentage}%)`, 25, yPosition);
                    yPosition += 6;
                });
                
                yPosition += 8;
            });
        }
        
        // Section questions ouvertes
        if (data.openQuestions && Object.keys(data.openQuestions).length > 0) {
            yPosition = this.checkPageBreak(doc, yPosition, 60);
            this.addPDFSection(doc, 'Questions ouvertes - Réponses', yPosition, warningColor, textColor);
            yPosition += 20;
            
            Object.entries(data.openQuestions).forEach(([questionKey, questionData]) => {
                yPosition = this.checkPageBreak(doc, yPosition, 40);
                
                // Titre de la question
                doc.setTextColor(...textColor);
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                const questionLines = doc.splitTextToSize(questionData.question, 170);
                questionLines.forEach(line => {
                    doc.text(line, 20, yPosition);
                    yPosition += 6;
                });
                
                doc.setFontSize(9);
                doc.setFont('helvetica', 'italic');
                doc.text(`${questionData.responsesList.length} réponse${questionData.responsesList.length > 1 ? 's' : ''}`, 20, yPosition);
                yPosition += 10;
                
                // Réponses
                questionData.responsesList.forEach((responseItem, index) => {
                    yPosition = this.checkPageBreak(doc, yPosition, 25);
                    
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(9);
                    doc.text(`${index + 1}. ${responseItem.genre}, ${responseItem.csp}:`, 25, yPosition);
                    yPosition += 6;
                    
                    const responseLines = doc.splitTextToSize(`"${responseItem.answer}"`, 160);
                    responseLines.forEach(line => {
                        doc.setFont('helvetica', 'italic');
                        doc.text(line, 30, yPosition);
                        yPosition += 5;
                    });
                    yPosition += 3;
                });
                
                yPosition += 10;
            });
        }
        
        // Pied de page
        this.addPDFFooter(doc);
        
        const fileName = `rapport_statistiques_${etablissement.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
    }

    addPDFSection(doc, title, yPosition, color, textColor) {
        doc.setFillColor(...color);
        doc.rect(15, yPosition - 5, 180, 15, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(title, 20, yPosition + 5);
        
        return yPosition + 15;
    }

    addPDFList(doc, items, yPosition, textColor, indent = false) {
        doc.setTextColor(...textColor);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        const xPosition = indent ? 25 : 20;
        
        items.forEach(item => {
            if (yPosition > 280) {
                doc.addPage();
                yPosition = 20;
            }
            doc.text(item, xPosition, yPosition);
            yPosition += 6;
        });
        
        return yPosition;
    }

    checkPageBreak(doc, yPosition, requiredSpace) {
        if (yPosition + requiredSpace > 280) {
            doc.addPage();
            return 20;
        }
        return yPosition;
    }

    addPDFFooter(doc) {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(`Page ${i} sur ${pageCount}`, 105, 290, { align: 'center' });
            doc.text('Rapport statistique généré automatiquement', 105, 295, { align: 'center' });
        }
    }yPosition += 8;
        doc.setFont('helvetica', 'normal');
        
        Object.entries(data.genre).forEach(([genre, count]) => {
            if (genre !== 'Non spécifié') {
                doc.text(`  ${genre}: ${count}`, 20, yPosition);
                yPosition += 6;
            }
        });
        
        yPosition += 5;
        
        doc.setFont('helvetica', 'bold');
        doc.text('Catégories socio-professionnelles:', 20, yPosition);
        yPosition += 8;
        doc.setFont('helvetica', 'normal');
        
        Object.entries(data.csp).forEach(([csp, count]) => {
            if (csp !== 'Non spécifié') {
                doc.text(`  ${csp}: ${count}`, 20, yPosition);
                yPosition += 6;
            }
        });
        
        if (yPosition > 250) {
            doc.addPage();
            yPosition = 20;
        } else {
            yPosition += 15;
        }
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Réponses détaillées', 20, yPosition);
        
        yPosition += 15;
        
        data.responses.forEach((response, index) => {
            if (yPosition > 240) {
                doc.addPage();
                yPosition = 20;
            }
            
            doc.setFillColor(...secondaryColor);
            doc.rect(15, yPosition - 5, 180, 12, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(`Réponse #${index + 1}`, 20, yPosition + 3);
            
            yPosition += 15;
            
            doc.setTextColor(...textColor);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            
            const responseDetails = [
                `Genre: ${response.genre}`,
                `CSP: ${response.csp}`,
                `Satisfaction: ${response.satisfaction}`,
                response.date ? `Date: ${response.date.toLocaleDateString('fr-FR')}` : null
            ].filter(Boolean);
            
            responseDetails.forEach(detail => {
                doc.text(detail, 20, yPosition);
                yPosition += 6;
            });
            
            if (response.additionalData && Object.keys(response.additionalData).length > 0) {
                yPosition += 3;
                doc.setFont('helvetica', 'bold');
                doc.text('Réponses détaillées:', 20, yPosition);
                yPosition += 6;
                doc.setFont('helvetica', 'normal');
                
                Object.entries(response.additionalData).forEach(([key, value]) => {
                    if (value && value.toString().trim() !== '' && value !== 'N/A') {
                        const question = this.formatQuestionFromKey(key);
                        const answer = value.toString();
                        
                        const maxWidth = 170;
                        const questionLines = doc.splitTextToSize(`Q: ${question}`, maxWidth);
                        const answerLines = doc.splitTextToSize(`R: ${answer}`, maxWidth);
                        
                        questionLines.forEach(line => {
                            if (yPosition > 280) {
                                doc.addPage();
                                yPosition = 20;
                            }
                            doc.text(line, 25, yPosition);
                            yPosition += 5;
                        });
                        
                        answerLines.forEach(line => {
                            if (yPosition > 280) {
                                doc.addPage();
                                yPosition = 20;
                            }
                            doc.text(line, 25, yPosition);
                            yPosition += 5;
                        });
                        
                        yPosition += 3;
                    }
                });
            }
            
            yPosition += 8;
        });
        
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(`Page ${i} sur ${pageCount}`, 105, 290, { align: 'center' });
            doc.text('Rapport généré automatiquement - Enquête satisfaction crèches', 105, 295, { align: 'center' });
        }
        
        const fileName = `rapport_${etablissement.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
    }
}

let surveyAnalyzer;
document.addEventListener('DOMContentLoaded', () => {
    surveyAnalyzer = new SurveyAnalyzer();
});
