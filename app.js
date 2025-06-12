// app.js - Adapté pour traiter le fichier "Classeur1_agrégé.xlsx" issu d'un export révisé.
//           Les colonnes d'établissement et de gestionnaire sont maintenant séparées,
//           et les follow‐up "Si non, pourquoi ?" apparaissent avec des suffixes explicites.
// Crèches de Strasbourg - Analyse d'enquêtes de satisfaction

(function() {
    'use strict';

    // ===== FileHandler Class =====
    class FileHandler {
        constructor() {
            this.selectedFile = null;
        }

        validateFile(file) {
            if (!file) return { valid: false, error: 'Aucun fichier sélectionné' };

            const validTypes = [
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel'
            ];
            if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
                return {
                    valid: false,
                    error: 'Veuillez sélectionner un fichier Excel (.xlsx ou .xls)'
                };
            }
            return { valid: true };
        }

        formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

        handleFileSelect(file, callback) {
            const validation = this.validateFile(file);
            if (!validation.valid) {
                callback({ success: false, error: validation.error });
                return;
            }
            this.selectedFile = file;
            callback({
                success: true,
                fileName: file.name,
                fileSize: this.formatFileSize(file.size)
            });
        }

        async processFile(progressCallback) {
            if (!this.selectedFile) {
                throw new Error('Aucun fichier sélectionné');
            }
            try {
                progressCallback('Lecture du fichier Excel...');
                const data = await this.readExcelFile(this.selectedFile);
                if (!data || data.length === 0) {
                    throw new Error('Le fichier Excel est vide');
                }
                progressCallback('Fichier lu avec succès');
                return data;
            } catch (error) {
                throw new Error(`Erreur lors du traitement du fichier: ${error.message}`);
            }
        }

        reset() {
            this.selectedFile = null;
        }
    }

    // ===== DataAnalyzer Class =====
    class DataAnalyzer {
        constructor() {
            this.rawData = [];
            this.surveyData = {};
        }

        identifyColumns(headers) {
            const mapping = {};
            mapping.managerColumns = []; // indices des colonnes gestionnaires
            mapping.checkboxGroups = {};

            headers.forEach((header, index) => {
                if (!header) return;
                const h = header.toString().trim();

                // 1) Colonne "Sélectionnez votre établissement :"
                if (h === 'Selectionnez votre établissement :') {
                    mapping.etablissement = index;
                }
                // 2) Colonnes gestionnaires explicites
                else if ([
                    'Ville de Strasbourg',
                    'AASBR [AASBR]',
                    'AGES',
                    'AGF',
                    'ALEF',
                    'Fondation d\'Auteuil',
                    'Fossé des treize',
                    'APEDI'
                ].includes(h)) {
                    mapping.managerColumns.push({ index: index, name: h });
                }
                // 3) Genre
                else if (h === 'Vous êtes ?') {
                    mapping.genre = index;
                }
                // 4) Âge du répondant
                else if (h === 'Votre âge ?') {
                    mapping.age = index;
                }
                // 5) Catégorie socio-professionnelle
                else if (h === 'Quelle est votre catégorie socio-professionnelle ?') {
                    mapping.csp = index;
                }
                // 6) Satisfaction globale
                else if (h === 'Je suis satisfait.e de l\'accueil de mon enfant à la crèche ?') {
                    mapping.satisfaction = index;
                }
                // 7) Capturer toutes les colonnes "Si non, pourquoi ? [<suffix>]" pour former des groupes
                else if (h.startsWith('Si non, pourquoi ?')) {
                    // On extrait la base "Si non, pourquoi ?" pour normaliser
                    const base = 'Si non, pourquoi ?';
                    if (!mapping.checkboxGroups[base]) {
                        mapping.checkboxGroups[base] = [];
                    }
                    mapping.checkboxGroups[base].push({ index: index, option: h });
                }
                // 8) Tous les autres en-têtes considérés comme questions seules ou à choix multiples
                //     Sera traité dynamiquement.
            });

            // Trier chaque groupe checkbox par index croissant
            Object.values(mapping.checkboxGroups).forEach(arr =>
                arr.sort((a, b) => a.index - b.index)
            );

            return mapping;
        }

        isValidResponse(row) {
            return row && row.length > 0 && row.some(cell => cell && cell.toString().trim() !== '');
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
            } catch {
                return null;
            }
        }

        normalizeHeaderKey(header) {
            if (!header) return 'unknown';
            return header.toString()
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');
        }

        extractResponseData(row, columnMapping, headers) {
            const response = {
                etablissement: 'Non identifié',
                gestionnaire: 'Non spécifié',
                genre: 'Non spécifié',
                age: 'Non spécifié',
                csp: 'Non spécifié',
                satisfaction: 'Non spécifié',
                date: null,
                additionalData: {},
                columnOrder: []
            };

            // 1) Établissement
            if (columnMapping.etablissement !== undefined) {
                const val = row[columnMapping.etablissement];
                if (val) {
                    const str = val.toString().trim();
                    if (str && str !== 'Sélectionnez votre établissement :') {
                        response.etablissement = str;
                    }
                }
            }

            // 2) Gestionnaire : colonne binaire parmi celles listées
            for (const { index, name } of columnMapping.managerColumns) {
                const val = row[index];
                if (val && val.toString().trim() !== '') {
                    response.gestionnaire = name;
                    break;
                }
            }

            // 3) Genre
            if (columnMapping.genre !== undefined) {
                const val = row[columnMapping.genre];
                if (val) {
                    const s = val.toString().toLowerCase();
                    if (s.includes('femme')) response.genre = 'Femme';
                    else if (s.includes('homme')) response.genre = 'Homme';
                }
            }

            // 4) Âge du répondant
            if (columnMapping.age !== undefined) {
                const val = row[columnMapping.age];
                if (val) {
                    response.age = val.toString().trim();
                }
            }

            // 5) CSP
            if (columnMapping.csp !== undefined) {
                const val = row[columnMapping.csp];
                if (val) {
                    response.csp = val.toString().trim();
                }
            }

            // 6) Satisfaction
            if (columnMapping.satisfaction !== undefined) {
                const val = row[columnMapping.satisfaction];
                if (val) {
                    response.satisfaction = val.toString().trim();
                }
            }

            // 7) Parcourir toutes les colonnes (hors celles déjà traitées) dans l'ordre
            const processed = new Set();
            const checkboxGroups = columnMapping.checkboxGroups || {};

            for (let i = 0; i < headers.length; i++) {
                // Ignorer si déjà traité
                if (processed.has(i)) continue;
                // Ignorer si c'est une colonne "simple" traitée plus haut
                if (
                    i === columnMapping.etablissement ||
                    i === columnMapping.genre ||
                    i === columnMapping.age ||
                    i === columnMapping.csp ||
                    i === columnMapping.satisfaction ||
                    columnMapping.managerColumns.some(m => m.index === i)
                ) {
                    continue;
                }

                const header = headers[i] ? headers[i].toString().trim() : '';
                const cellValue = row[i];
                const cellStr = cellValue ? cellValue.toString().trim() : '';

                // 7a) Si c'est une colonne appartenant à un groupe de "Si non, pourquoi ?"
                let matchedGroupKey = null;
                let groupArray = null;
                for (const base in checkboxGroups) {
                    if (checkboxGroups[base].some(o => o.index === i)) {
                        matchedGroupKey = base;
                        groupArray = checkboxGroups[base];
                        break;
                    }
                }
                if (matchedGroupKey) {
                    // Construire la clé unique pour ce groupe
                    const normalizedKey = this.normalizeHeaderKey(matchedGroupKey);
                    const selectedOptions = [];

                    // Pour chaque option du groupe "Si non, pourquoi ?"
                    groupArray.forEach(({ index, option }) => {
                        const v = row[index];
                        const s = v ? v.toString().trim() : '';
                        if (s && s.toLowerCase() !== 'sans réponse' && s.toLowerCase() !== 'n/a') {
                            // On ajoute exactement le texte libre (suivi)
                            selectedOptions.push(`${option} : ${s}`);
                        }
                        processed.add(index);
                    });

                    if (selectedOptions.length > 0) {
                        response.additionalData[normalizedKey] = {
                            value: selectedOptions.join('; '),
                            originalHeader: matchedGroupKey,
                            columnIndex: groupArray[0].index
                        };
                        response.columnOrder.push({
                            key: normalizedKey,
                            index: groupArray[0].index,
                            header: matchedGroupKey
                        });
                    }
                    continue;
                }

                // 7b) Traitement normal : si case non vide, on stocke
                if (cellStr && cellStr.toLowerCase() !== 'sans réponse' && cellStr !== 'N/A') {
                    const key = this.normalizeHeaderKey(header);
                    response.additionalData[key] = {
                        value: cellStr,
                        originalHeader: header,
                        columnIndex: i
                    };
                    response.columnOrder.push({
                        key: key,
                        index: i,
                        header: header
                    });
                    processed.add(i);
                }
            }

            // 8) Trier columnOrder par index initial
            response.columnOrder.sort((a, b) => a.index - b.index);

            return response;
        }

        analyzeData(excelData) {
            if (!excelData || excelData.length === 0) {
                throw new Error('Le fichier Excel est vide');
            }

            const headers = excelData[0];
            const rows = excelData.slice(1);
            const columnMapping = this.identifyColumns(headers);
            const responses = [];

            rows.forEach((row, idx) => {
                if (this.isValidResponse(row)) {
                    const resp = this.extractResponseData(row, columnMapping, headers);
                    responses.push({ ...resp, id: idx + 1 });
                }
            });

            if (responses.length === 0) {
                throw new Error('Aucune réponse valide trouvée dans le fichier');
            }

            const validResponses = responses.filter(r => r.etablissement !== 'Non identifié');
            this.rawData = validResponses.length > 0 ? validResponses : responses;
            this.calculateStatistics();
            return {
                totalResponses: this.rawData.length,
                etablissements: Object.keys(this.surveyData).length
            };
        }

        calculateStatistics() {
            const grouped = {};
            this.rawData.forEach(r => {
                if (!grouped[r.etablissement]) grouped[r.etablissement] = [];
                grouped[r.etablissement].push(r);
            });
            this.surveyData = {};
            Object.entries(grouped).forEach(([etab, arr]) => {
                this.surveyData[etab] = this.calculateEtablissementStatistics(etab, arr);
            });
        }

        calculateEtablissementStatistics(etab, responses) {
            const stats = {
                totalReponses: responses.length,
                satisfaction: {},
                gestionnaire: {},
                genre: {},
                csp: {},
                cspPercentages: {},
                responses: responses,
                questionStats: {},
                openQuestions: {},
                closedQuestions: {},
                multiOptionsQuestions: {}
            };

            // a) Comptages de base
            responses.forEach(r => {
                stats.satisfaction[r.satisfaction] = (stats.satisfaction[r.satisfaction] || 0) + 1;
                stats.gestionnaire[r.gestionnaire] = (stats.gestionnaire[r.gestionnaire] || 0) + 1;
                stats.genre[r.genre] = (stats.genre[r.genre] || 0) + 1;
                stats.csp[r.csp] = (stats.csp[r.csp] || 0) + 1;
            });

            // b) Pourcentages CSP
            const totalCSP = Object.values(stats.csp).reduce((a, b) => a + b, 0);
            Object.entries(stats.csp).forEach(([key, cnt]) => {
                if (key !== 'Non spécifié' && totalCSP > 0) {
                    stats.cspPercentages[key] = Math.round((cnt / totalCSP) * 100);
                }
            });

            // c) Collecter toutes les clés de questions dans l'ordre de colonnes
            const allKeys = new Set();
            const orderMap = new Map();
            responses.forEach(r => {
                r.columnOrder.forEach(col => {
                    if (!allKeys.has(col.key)) {
                        allKeys.add(col.key);
                        orderMap.set(col.key, col.index);
                    }
                });
            });

            // d) Trier par index, masquer B–I (1 à 8)
            const sortedKeys = Array.from(allKeys)
                .filter(k => {
                    const idx = orderMap.get(k) || 0;
                    return idx < 1 || idx > 8;
                })
                .sort((a, b) => (orderMap.get(a) || 0) - (orderMap.get(b) || 0));

            // e) Analyser chaque question
            sortedKeys.forEach(key => {
                const qData = this.analyzeQuestion(key, responses);
                if (qData.totalResponses > 0) {
                    stats.questionStats[key] = qData;
                    if (qData.isMultiOptions) stats.multiOptionsQuestions[key] = qData;
                    else if (qData.isOpenQuestion) stats.openQuestions[key] = qData;
                    else stats.closedQuestions[key] = qData;
                }
            });

            return stats;
        }

        analyzeQuestion(key, responses) {
            const data = {
                question: '',
                originalHeader: '',
                columnIndex: 0,
                answers: {},
                totalResponses: 0,
                responsesList: [],
                isOpenQuestion: false,
                isMultiOptions: false
            };

            // a) Récupérer en-tête original et index
            const firstWith = responses.find(r => r.additionalData[key]);
            if (firstWith) {
                const info = firstWith.additionalData[key];
                data.originalHeader = info.originalHeader;
                data.columnIndex = info.columnIndex;
                data.question = info.originalHeader;
            }

            // Forcer certaines questions à être traitées comme ouvertes selon leur titre
            const questionLower = data.question.toLowerCase();
            const isDefinitelyOpen = questionLower.includes('remarques') || 
                                   questionLower.includes('suggestions') || 
                                   questionLower.includes('complémentaires') ||
                                   questionLower.includes('commentaire') ||
                                   questionLower.includes('préciser') ||
                                   questionLower.includes('pourquoi') ||
                                   questionLower.includes('avez-vous des remarques');

            // Si c'est définivement une question ouverte, forcer le flag
            if (isDefinitelyOpen) {
                data.isOpenQuestion = true;
            }

            // b) Parcourir chaque réponse
            responses.forEach(r => {
                if (!r.additionalData[key]) return;
                const info = r.additionalData[key];
                const ans = info.value;
                if (!ans || ans === 'N/A') return;

                data.totalResponses++;

                // Si c'est définivement une question ouverte, traiter comme telle
                if (isDefinitelyOpen) {
                    data.responsesList.push({
                        answer: ans,
                        respondentId: r.id,
                        genre: r.genre,
                        csp: r.csp
                    });
                    return;
                }

                // Si chaîne contient plusieurs parties séparées par "; " => choix multiples
                if (ans.includes(';')) {
                    data.isMultiOptions = true;
                    const parts = ans.split(';').map(p => p.trim()).filter(p => p);
                    const seen = new Set();
                    parts.forEach(opt => {
                        if (!seen.has(opt)) {
                            data.answers[opt] = (data.answers[opt] || 0) + 1;
                            seen.add(opt);
                        }
                    });
                    return;
                }

                // Unique (fermé ou ouvert)
                if (this.isClosedQuestion(ans)) {
                    const norm = this.normalizeClosedAnswer(ans);
                    data.answers[norm] = (data.answers[norm] || 0) + 1;
                } else {
                    data.isOpenQuestion = true;
                    data.responsesList.push({
                        answer: ans,
                        respondentId: r.id,
                        genre: r.genre,
                        csp: r.csp
                    });
                }
            });

            return data;
        }

        isClosedQuestion(ans) {
            const closed = [
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
            const lower = ans.toLowerCase().trim();
            
            // Si la réponse contient plus de 30 caractères, c'est probablement une question ouverte
            if (lower.length > 30) return false;
            
            // Si la réponse contient des phrases complexes, c'est une question ouverte
            if (lower.includes(' et ') || lower.includes(' ou ') || lower.includes(' mais ') || 
                lower.includes(' car ') || lower.includes(' pour ') || lower.includes(' avec ') ||
                lower.includes(' dans ') || lower.includes(' sur ') || lower.includes(' par ') ||
                lower.includes(' donc ') || lower.includes(' alors ') || lower.includes(' ainsi ') ||
                lower.includes(' cette ') || lower.includes(' cette ') || lower.includes(' cette ')) {
                return false;
            }
            
            // Si la réponse contient des mots typiques de commentaires libres
            if (lower.includes('équipe') || lower.includes('creche') || lower.includes('crèche') ||
                lower.includes('enfant') || lower.includes('directeur') || lower.includes('directrice') ||
                lower.includes('personnel') || lower.includes('éducatrice') || lower.includes('merci') ||
                lower.includes('problème') || lower.includes('suggestion') || lower.includes('amélioration')) {
                return false;
            }
            
            return closed.some(c => lower === c || lower.includes(c)) || lower.length < 15;
        }

        normalizeClosedAnswer(ans) {
            const lower = ans.toLowerCase().trim();
            if (['oui','yes','x','✓','1'].includes(lower)) return 'Oui';
            if (['non','no','0'].includes(lower)) return 'Non';
            if (lower.includes('très satisfait')) return 'Très satisfait';
            if (lower.includes('plutôt satisfait')) return 'Plutôt satisfait';
            if (lower.includes('peu satisfait')) return 'Peu satisfait';
            if (lower.includes('pas satisfait')) return 'Pas satisfait';
            if (lower.includes('toujours')) return 'Toujours';
            if (lower.includes('souvent')) return 'Souvent';
            if (lower.includes('parfois')) return 'Parfois';
            if (lower.includes('jamais')) return 'Jamais';
            return ans.charAt(0).toUpperCase() + ans.slice(1).toLowerCase();
        }

        calculateSatisfactionPercentage(satData) {
            const total = Object.values(satData).reduce((a, b) => a + b, 0);
            const sat = (satData["Très satisfait"] || 0) + (satData["Plutôt satisfait"] || 0);
            return total > 0 ? Math.round((sat / total) * 100) : 0;
        }

        calculatePercentages(ansMap, total) {
            const pct = {};
            Object.entries(ansMap).forEach(([ans, cnt]) => {
                pct[ans] = { count: cnt, percentage: Math.round((cnt / total) * 100) };
            });
            return pct;
        }

        getSurveyData() {
            return this.surveyData;
        }

        getRawData() {
            return this.rawData;
        }

        reset() {
            this.rawData = [];
            this.surveyData = {};
        }
    }

    // ===== UIRenderer Class =====
    class UIRenderer {
        constructor() {
            this.currentEtablissement = null;
        }

        getGestionnaireClass(gestionnaire) {
            const map = {
                'Ville de Strasbourg': 'ville',
                'AASBR [AASBR]': 'aasbr',
                'AGES': 'ages',
                'AGF': 'agf',
                'ALEF': 'alef',
                'Fondation d\'Auteuil': 'fondation',
                'Fossé des treize': 'fosse',
                'APEDI': 'apedi'
            };
            return map[gestionnaire] || 'ville';
        }

        showLoading(msg) {
            const loading = document.getElementById('loading');
            if (loading) {
                loading.querySelector('p').textContent = msg;
                loading.style.display = 'block';
            }
            this.hideOtherSections(['loading']);
        }

        showError(msg) {
            const err = document.getElementById('error-message');
            if (err) {
                document.getElementById('error-text').textContent = msg;
                err.style.display = 'block';
            }
            this.hideOtherSections(['error-message']);
        }

        showUpload() {
            document.getElementById('file-upload-section').style.display = 'block';
            this.hideOtherSections(['file-upload-section']);
        }

        showResults() {
            document.getElementById('results').style.display = 'block';
            this.hideOtherSections(['results']);
            setTimeout(() => {
                document.querySelectorAll('.satisfaction-fill').forEach(bar => {
                    const w = bar.style.width;
                    bar.style.width = '0%';
                    setTimeout(() => (bar.style.width = w), 100);
                });
            }, 100);
        }

        hideOtherSections(except = []) {
            ['loading', 'error-message', 'file-upload-section', 'results'].forEach(id => {
                if (!except.includes(id)) {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                }
            });
        }

        showFileInfo(name, size) {
            document.getElementById('file-name').textContent = `📁 ${name} (${size})`;
            document.getElementById('file-info').style.display = 'block';
        }

        hideFileInfo() {
            document.getElementById('file-info').style.display = 'none';
        }

       renderSummary(surveyData, rawData) {
            const totalResponses = Object.values(surveyData).reduce((sum, d) => sum + d.totalReponses, 0);
            const totalEtab = Object.keys(surveyData).length;

            // --- DEBUT DE LA CORRECTION ---
            let totalPositiveSatisfaction = 0;
            let totalSatisfactionResponses = 0;
            
            Object.values(surveyData).forEach(etablissementData => {
                // Numérateur : On additionne uniquement les réponses positives.
                totalPositiveSatisfaction += (etablissementData.satisfaction['Très satisfait'] || 0) + (etablissementData.satisfaction['Plutôt satisfait'] || 0);

                // Dénominateur : On additionne TOUTES les réponses à la question de satisfaction
                // pour obtenir le bon total pour cette question spécifique.
                const totalResponsesForThisQuestion = Object.values(etablissementData.satisfaction).reduce((sum, count) => sum + count, 0);
                totalSatisfactionResponses += totalResponsesForThisQuestion;
            });

            // Calcul final avec le bon dénominateur.
            const globalSat = totalSatisfactionResponses > 0 
                ? Math.round((totalPositiveSatisfaction / totalSatisfactionResponses) * 100) 
                : 0;
            // --- FIN DE LA CORRECTION ---

            const dates = rawData.map(r => r.date).filter(d => d);
            let range = '-';
            if (dates.length > 0) {
                const mn = new Date(Math.min(...dates));
                const mx = new Date(Math.max(...dates));
                range =
                    mn.getTime() === mx.getTime()
                        ? mn.toLocaleDateString('fr-FR')
                        : `${mn.toLocaleDateString('fr-FR')} - ${mx.toLocaleDateString('fr-FR')}`;
            }
            document.getElementById('total-responses').textContent = totalResponses;
            document.getElementById('total-etablissements').textContent = totalEtab;
            document.getElementById('satisfaction-globale').textContent = `${globalSat}%`; // La variable corrigée est utilisée ici
            document.getElementById('date-enquete').textContent = range;
        }

        renderEtablissements(surveyData, analyzer) {
            const container = document.getElementById('etablissements-container');
            container.innerHTML = '';
            Object.entries(surveyData).forEach(([name, data]) => {
                const satPerc = analyzer.calculateSatisfactionPercentage(data.satisfaction);
                const gest = Object.keys(data.gestionnaire)[0];
                const gestClass = this.getGestionnaireClass(gest);
                const card = document.createElement('div');
                card.className = 'etablissement-card';
                card.innerHTML = `
                    <div class="card-header ${gestClass}">
                        <h3>${name}</h3>
                        <span class="gestionnaire-badge">${gest}</span>
                    </div>
                    <div class="card-content">
                        <div class="metric">
                            <div class="metric-label">📊 Satisfaction globale</div>
                            <div class="metric-value">${satPerc}%</div>
                            <div class="satisfaction-bar">
                                <div class="satisfaction-fill" style="width: ${satPerc}%"></div>
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
                                        .filter(([g]) => g !== 'Non spécifié')
                                        .map(([g, c]) => `${g}: ${c}`)
                                        .join('<br>') || 'Non spécifié'}
                                </div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">💼 Catégories socio-prof.</div>
                                <div class="detail-value">
                                    ${Object.entries(data.cspPercentages)
                                        .map(([csp, pct]) => `${csp}: ${pct}%`)
                                        .join('<br>') || 'Non spécifié'}
                                </div>
                            </div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">📈 Détail satisfaction</div>
                            <div style="font-size:0.9rem;color:#666;margin-top:5px;">
                                ${Object.entries(data.satisfaction)
                                    .map(([lvl, cnt]) => `${lvl}: ${cnt} réponse${cnt > 1 ? 's' : ''}`)
                                    .join(' • ')}
                            </div>
                        </div>
                        <div class="card-actions">
                            <button class="card-action-btn" onclick="window.surveyApp.showDetails('${name}')">
                                📋 Détails
                            </button>
                            <button class="card-action-btn export" onclick="window.surveyApp.exportEtablissementToPDF('${name}')">
                                📄 PDF
                            </button>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        }

        showModal(name) {
            this.currentEtablissement = name;
            document.getElementById('modal-title').textContent = `Détails - ${name}`;
            document.getElementById('details-modal').style.display = 'block';
            document.getElementById('modal-loading').style.display = 'block';
            document.getElementById('modal-content').innerHTML = '';
        }

        hideModal() {
            document.getElementById('details-modal').style.display = 'none';
            this.currentEtablissement = null;
        }

        hideModalLoading() {
            document.getElementById('modal-loading').style.display = 'none';
        }

        renderDetailedResponses(name, data, analyzer) {
            const container = document.getElementById('modal-content');
            let html = '';

            // Résumé
            html += `
                <div class="response-item" style="background: linear-gradient(135deg,#f093fb 0%,#f5576c 100%);color:white;border:none;">
                    <h3 style="margin:0 0 15px 0;">📊 Résumé pour ${name}</h3>
                    <div class="response-header" style="border-bottom:1px solid rgba(255,255,255,0.3);">
                        <div class="response-field">
                            <div class="response-field-label" style="color:rgba(255,255,255,0.8);">Satisfaction</div>
                            <div class="response-field-value" style="color:white;">${analyzer.calculateSatisfactionPercentage(data.satisfaction)}%</div>
                        </div>
                        <div class="response-field">
                            <div class="response-field-label" style="color:rgba(255,255,255,0.8);">Total réponses</div>
                            <div class="response-field-value" style="color:white;">${data.totalReponses}</div>
                        </div>
                        <div class="response-field">
                            <div class="response-field-label" style="color:rgba(255,255,255,0.8);">Gestionnaire</div>
                            <div class="response-field-value" style="color:white;">${Object.keys(data.gestionnaire)[0]}</div>
                        </div>
                    </div>
                </div>
            `;

            // Construire liste des questions dans l'ordre des colonnes
            const ordered = Object.entries(data.questionStats)
                .map(([key, qData]) => ({ key, idx: qData.columnIndex, qData }))
                .sort((a, b) => a.idx - b.idx);

            // Afficher chacune
            ordered.forEach(({ key, qData }) => {
                if (qData.totalResponses === 0) return;
                html += `<div class="response-item" style="margin-bottom:20px;">`;
                html += `<h4 style="color:#333;margin-bottom:10px;">${qData.question}</h4>`;
                html += `<div style="margin-bottom:10px;font-size:0.9rem;color:#666;">${qData.totalResponses} réponse${qData.totalResponses > 1 ? 's' : ''}</div>`;

                // Choix multiples
                if (qData.isMultiOptions) {
                    const pcts = analyzer.calculatePercentages(qData.answers, qData.totalResponses);
                    html += `<div class="question-stats">`;
                    Object.entries(pcts).forEach(([opt, stat]) => {
                        html += `
                            <div class="stat-row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:8px;background:#f8f9fa;border-radius:5px;">
                                <span style="font-weight:500;">${opt}</span>
                                <div style="display:flex;align-items:center;gap:10px;">
                                    <div class="mini-bar" style="width:100px;height:8px;background:#e9ecef;border-radius:4px;overflow:hidden;">
                                        <div style="width:${stat.percentage}%;height:100%;background:linear-gradient(90deg,#ffa17f,#00223e);transition:width 0.5s ease;"></div>
                                    </div>
                                    <span style="font-weight:bold;min-width:50px;text-align:right;">${stat.count} (${stat.percentage}%)</span>
                                </div>
                            </div>
                        `;
                    });
                    html += `</div>`;
                }
                // Question ouverte
                else if (qData.isOpenQuestion) {
                    html += `<div class="open-responses">`;
                    qData.responsesList.forEach((item, idx) => {
                        html += `
                            <div class="open-response-item" style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-left:3px solid #fa709a;border-radius:0 5px 5px 0;">
                                <div class="response-text" style="margin-bottom:8px;font-style:italic;">
                                    "${item.answer}"
                                </div>
                                <div class="response-meta" style="font-size:0.8rem;color:#666;">
                                    Répondant #${item.respondentId} - ${item.genre}, ${item.csp}
                                </div>
                            </div>
                        `;
                    });
                    html += `</div>`;
                }
                // Question fermée simple
                else {
                    const pcts = analyzer.calculatePercentages(qData.answers, qData.totalResponses);
                    html += `<div class="question-stats">`;
                    Object.entries(pcts).forEach(([ans, stat]) => {
                        html += `
                            <div class="stat-row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:8px;background:#f8f9fa;border-radius:5px;">
                                <span style="font-weight:500;">${ans}</span>
                                <div style="display:flex;align-items:center;gap:10px;">
                                    <div class="mini-bar" style="width:100px;height:8px;background:#e9ecef;border-radius:4px;overflow:hidden;">
                                        <div style="width:${stat.percentage}%;height:100%;background:linear-gradient(90deg,#4facfe,#00f2fe);transition:width 0.5s ease;"></div>
                                    </div>
                                    <span style="font-weight:bold;min-width:50px;text-align:right;">${stat.count} (${stat.percentage}%)</span>
                                </div>
                            </div>
                        `;
                    });
                    html += `</div>`;
                }

                html += `</div>`;
            });

            if (ordered.length === 0) {
                html += `
                    <div class="response-item">
                        <h4>📋 Données disponibles</h4>
                        <p>Les statistiques de base sont disponibles. Chargez un fichier Excel complet pour voir toutes les questions détaillées.</p>
                    </div>
                `;
            }

            container.innerHTML = html;
        }

        getCurrentEtablissement() {
            return this.currentEtablissement;
        }
    }

    // ===== PDFExporter Class (ancienne version en fallback) =====
    class PDFExporter {
        constructor() {
            this.primaryColor = [79, 172, 254];
            this.textColor = [51, 51, 51];
        }

        exportEtablissementToPDF(name, surveyData, analyzer) {
            if (!surveyData[name]) return;
            const data = surveyData[name];
            const gest = Object.keys(data.gestionnaire)[0];
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            let y = 20;
            this.addHeader(doc, name);
            y = 60;
            y = this.addGeneralInfo(doc, y, name, gest, data, analyzer);

            // Construire liste des questions dans l'ordre des colonnes
            const ordered = Object.entries(data.questionStats)
                .map(([key, qData]) => ({ key, idx: qData.columnIndex, qData }))
                .sort((a, b) => a.idx - b.idx);

            // Afficher chaque question
            ordered.forEach(({ key, qData }) => {
                if (qData.totalResponses === 0) return;
                if (y > 200) {
                    doc.addPage();
                    y = 20;
                }
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                const lines = doc.splitTextToSize(qData.question, 170);
                lines.forEach(line => {
                    if (y > 250) {
                        doc.addPage();
                        y = 20;
                    }
                    doc.text(line, 20, y);
                    y += 6;
                });

                doc.setFontSize(10);
                doc.setFont('helvetica', 'italic');
                doc.text(`${qData.totalResponses} réponse${qData.totalResponses > 1 ? 's' : ''}`, 20, y);
                y += 10;

                if (qData.isMultiOptions) {
                    const pcts = analyzer.calculatePercentages(qData.answers, qData.totalResponses);
                    doc.setFont('helvetica', 'normal');
                    Object.entries(pcts).forEach(([opt, stat]) => {
                        if (y > 280) {
                            doc.addPage();
                            y = 20;
                        }
                        doc.text(`  ${opt} : ${stat.count} (${stat.percentage}%)`, 25, y);
                        y += 6;
                    });
                    y += 8;
                } else if (qData.isOpenQuestion) {
                    doc.setFont('helvetica', 'normal');
                    qData.responsesList.forEach((item, idx) => {
                        if (y > 240) {
                            doc.addPage();
                            y = 20;
                        }
                        doc.setFontSize(9);
                        doc.text(`${idx + 1}. ${item.genre}, ${item.csp}:`, 25, y);
                        y += 6;
                        const respLines = doc.splitTextToSize(`"${item.answer}"`, 160);
                        respLines.forEach(line => {
                            if (y > 280) {
                                doc.addPage();
                                y = 20;
                            }
                            doc.setFont('helvetica', 'italic');
                            doc.text(line, 30, y);
                            y += 5;
                        });
                        y += 3;
                    });
                    y += 10;
                } else {
                    const pcts = analyzer.calculatePercentages(qData.answers, qData.totalResponses);
                    doc.setFont('helvetica', 'normal');
                    Object.entries(pcts).forEach(([ans, stat]) => {
                        if (y > 280) {
                            doc.addPage();
                            y = 20;
                        }
                        doc.text(`  ${ans} : ${stat.count} (${stat.percentage}%)`, 25, y);
                        y += 6;
                    });
                    y += 8;
                }
            });

            if (ordered.length === 0) {
                if (y > 240) {
                    doc.addPage();
                    y = 20;
                }
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.text('📋 Données disponibles', 20, y);
                y += 10;
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.text(
                    'Les statistiques de base sont disponibles. Chargez un fichier Excel complet pour voir toutes les questions détaillées.',
                    20,
                    y
                );
                y += 10;
            }

            this.addFooter(doc);
            const fileName = `rapport_${name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date()
                .toISOString()
                .split('T')[0]}.pdf`;
            doc.save(fileName);
        }

        addHeader(doc, name) {
            doc.setFillColor(...this.primaryColor);
            doc.rect(0, 0, 210, 40, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.text("Rapport statistique d'enquête", 105, 20, { align: 'center' });
            doc.setFontSize(14);
            doc.setFont('helvetica', 'normal');
            doc.text(name, 105, 30, { align: 'center' });
        }

        addGeneralInfo(doc, y, name, gest, data, analyzer) {
            doc.setTextColor(...this.textColor);
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('Informations générales', 20, y);
            y += 15;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            const lines = [
                `Établissement : ${name}`,
                `Gestionnaire : ${gest}`,
                `Nombre de réponses : ${data.totalReponses}`,
                `Satisfaction globale : ${analyzer.calculateSatisfactionPercentage(data.satisfaction)}%`,
                `Date du rapport : ${new Date().toLocaleDateString('fr-FR')}`
            ];
            lines.forEach(l => {
                doc.text(l, 20, y);
                y += 8;
            });
            return y + 10;
        }

        addFooter(doc) {
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(128, 128, 128);
                doc.text(`Page ${i} sur ${pageCount}`, 105, 290, { align: 'center' });
                doc.text('Rapport généré automatiquement', 105, 295, { align: 'center' });
            }
        }

        exportAllDataToJSON(surveyData, rawData) {
            if (!Object.keys(surveyData).length) return;
            const out = {
                summary: {
                    totalResponses: Object.values(surveyData).reduce((s, d) => s + d.totalReponses, 0),
                    totalEtablissements: Object.keys(surveyData).length,
                    exportDate: new Date().toISOString()
                },
                etablissements: surveyData,
                rawResponses: rawData
            };
            const str = JSON.stringify(out, null, 2);
            const blob = new Blob([str], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `resultats_enquete_creches_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
        }
    }

    // ===== SurveyApp Main Class =====
    class SurveyApp {
        constructor() {
            console.log('🚀 Initialisation de Survey Analyzer App...');
            this.fileHandler = new FileHandler();
            this.dataAnalyzer = new DataAnalyzer();
            this.uiRenderer = new UIRenderer();
            // Utiliser la classe PDF améliorée si disponible, sinon l'ancienne
            this.pdfExporter = window.AdvancedPDFExporter ? new window.AdvancedPDFExporter() : new PDFExporter();
            this.initializeEventListeners();
            console.log('✅ Application initialisée avec', window.AdvancedPDFExporter ? 'AdvancedPDFExporter' : 'PDFExporter basique');
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

            if (selectFileBtn) selectFileBtn.addEventListener('click', () => fileInput.click());
            if (fileInput) fileInput.addEventListener('change', e => this.handleFileSelect(e.target.files[0]));
            if (uploadArea) {
                uploadArea.addEventListener('dragover', e => this.handleDragOver(e));
                uploadArea.addEventListener('dragleave', e => this.handleDragLeave(e));
                uploadArea.addEventListener('drop', e => this.handleDrop(e));
            }
            if (processFileBtn) processFileBtn.addEventListener('click', () => this.processFile());
            if (newFileBtn) newFileBtn.addEventListener('click', () => this.resetToUpload());
            if (retryBtn) retryBtn.addEventListener('click', () => this.resetToUpload());
            if (exportBtn) exportBtn.addEventListener('click', () => this.exportResults());
            if (closeModal) closeModal.addEventListener('click', () => this.closeModal());
            if (exportPdfBtn) exportPdfBtn.addEventListener('click', () => this.exportCurrentEtablissementToPDF());
            window.addEventListener('click', e => {
                if (e.target === modal) this.closeModal();
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
            if (files.length > 0) this.handleFileSelect(files[0]);
        }

        handleFileSelect(file) {
            this.fileHandler.handleFileSelect(file, result => {
                if (result.success) {
                    this.uiRenderer.showFileInfo(result.fileName, result.fileSize);
                } else {
                    this.uiRenderer.showError(result.error);
                }
            });
        }

        async processFile() {
            try {
                const excelData = await this.fileHandler.processFile(msg => this.uiRenderer.showLoading(msg));
                this.uiRenderer.showLoading('Analyse des données...');
                setTimeout(() => {
                    try {
                        const res = this.dataAnalyzer.analyzeData(excelData);
                        this.renderResults();
                        console.log(`✅ Analyse terminée: ${res.totalResponses} réponses, ${res.etablissements} établissements`);
                    } catch (err) {
                        this.uiRenderer.showError(`Erreur lors de l'analyse: ${err.message}`);
                    }
                }, 500);
            } catch (err) {
                console.error('Erreur traitement:', err);
                this.uiRenderer.showError(err.message);
            }
        }

        renderResults() {
            const sd = this.dataAnalyzer.getSurveyData();
            const rd = this.dataAnalyzer.getRawData();
            this.uiRenderer.renderSummary(sd, rd);
            this.uiRenderer.renderEtablissements(sd, this.dataAnalyzer);
            this.uiRenderer.showResults();
        }

        showDetails(name) {
            const sd = this.dataAnalyzer.getSurveyData();
            const data = sd[name];
            if (!data) return;
            this.uiRenderer.showModal(name);
            setTimeout(() => {
                this.uiRenderer.renderDetailedResponses(name, data, this.dataAnalyzer);
                this.uiRenderer.hideModalLoading();
            }, 500);
        }

        closeModal() {
            this.uiRenderer.hideModal();
        }

        exportCurrentEtablissementToPDF() {
            const cur = this.uiRenderer.getCurrentEtablissement();
            if (cur) this.exportEtablissementToPDF(cur);
        }

        exportEtablissementToPDF(name) {
            const sd = this.dataAnalyzer.getSurveyData();
            this.pdfExporter.exportEtablissementToPDF(name, sd, this.dataAnalyzer);
        }

        exportResults() {
            const sd = this.dataAnalyzer.getSurveyData();
            const rd = this.dataAnalyzer.getRawData();
            this.pdfExporter.exportAllDataToJSON(sd, rd);
        }

        resetToUpload() {
            this.fileHandler.reset();
            this.dataAnalyzer.reset();
            document.getElementById('file-input').value = '';
            this.uiRenderer.hideFileInfo();
            this.uiRenderer.showUpload();
        }
    }

    // ===== Initialisation =====
    function initializeApp() {
        try {
            window.surveyApp = new SurveyApp();
            console.log('🎉 Survey Analyzer ready!');
        } catch (err) {
            console.error('❌ Erreur d\'initialisation:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }
})();