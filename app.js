// app.js - Version avec affichage en tableaux, tri et filtres + STATISTIQUES GLOBALES
// Crèches de Strasbourg - Analyse d'enquêtes de satisfaction
// VERSION CORRIGÉE : Calcul du taux de satisfaction fiabilisé + Module statistiques globales

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
                'application/vnd.ms-excel',
                'application/json'
            ];
            const validExtensions = /\.(xlsx|xls|json)$/i;
            
            if (!validTypes.includes(file.type) && !file.name.match(validExtensions)) {
                return {
                    valid: false,
                    error: 'Veuillez sélectionner un fichier Excel (.xlsx, .xls) ou JSON (.json)'
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

        readJSONFile(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const jsonData = JSON.parse(e.target.result);
                        resolve(jsonData);
                    } catch (error) {
                        reject(new Error('Impossible de lire le fichier JSON : format invalide'));
                    }
                };
                reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
                reader.readAsText(file);
            });
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
                const fileName = this.selectedFile.name.toLowerCase();
                
                if (fileName.endsWith('.json')) {
                    progressCallback('Lecture du fichier JSON...');
                    const jsonData = await this.readJSONFile(this.selectedFile);
                    if (!jsonData || !jsonData.etablissements || !jsonData.rawResponses) {
                        throw new Error('Le fichier JSON ne contient pas les données attendues');
                    }
                    progressCallback('Fichier JSON lu avec succès');
                    return { type: 'json', data: jsonData };
                } else {
                    progressCallback('Lecture du fichier Excel...');
                    const excelData = await this.readExcelFile(this.selectedFile);
                    if (!excelData || excelData.length === 0) {
                        throw new Error('Le fichier Excel est vide');
                    }
                    progressCallback('Fichier Excel lu avec succès');
                    return { type: 'excel', data: excelData };
                }
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
            this.etablissementGestionnaireMap = new Map();
        }

        async loadEtablissementMapping(file) {
            try {
                console.log('📁 Chargement du mapping établissement-gestionnaire...');
                
                const data = await this.readExcelFile(file);
                if (!data || data.length === 0) {
                    throw new Error('Le fichier de mapping est vide');
                }

                const headers = data[0];
                console.log('📋 En-têtes trouvés:', headers);

                let etablissementCol = -1;
                let gestionnaireCol = -1;

                headers.forEach((header, index) => {
                    if (!header) return;
                    const h = header.toString().toLowerCase().trim();
                    
                    if (h.includes('etablissement') || h.includes('établissement') || h.includes('creche') || h.includes('crèche') || h.includes('nom')) {
                        etablissementCol = index;
                        console.log(`✅ Colonne établissement trouvée: ${header} (index ${index})`);
                    }
                    
                    if (h.includes('gestionnaire') || h.includes('partenaire') || h.includes('operateur')) {
                        gestionnaireCol = index;
                        console.log(`✅ Colonne gestionnaire trouvée: ${header} (index ${index})`);
                    }
                });

                if (etablissementCol === -1 || gestionnaireCol === -1) {
                    throw new Error('Colonnes établissement ou gestionnaire non trouvées dans le fichier');
                }

                this.etablissementGestionnaireMap.clear();
                let mappedCount = 0;

                for (let i = 1; i < data.length; i++) {
                    const row = data[i];
                    const etablissement = row[etablissementCol];
                    const gestionnaire = row[gestionnaireCol];

                    if (etablissement && gestionnaire) {
                        const etablissementName = etablissement.toString().trim();
                        const gestionnaireName = gestionnaire.toString().trim();
                        
                        this.etablissementGestionnaireMap.set(etablissementName, gestionnaireName);
                        mappedCount++;
                        
                        console.log(`📍 Mapping: "${etablissementName}" → "${gestionnaireName}"`);
                    }
                }

                console.log(`✅ Mapping chargé: ${mappedCount} établissements mappés`);
                return mappedCount;

            } catch (error) {
                console.error('❌ Erreur lors du chargement du mapping:', error);
                throw error;
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

        findGestionnaireForEtablissement(etablissementName) {
            if (!etablissementName || this.etablissementGestionnaireMap.size === 0) {
                return 'Non spécifié';
            }

            if (this.etablissementGestionnaireMap.has(etablissementName)) {
                return this.etablissementGestionnaireMap.get(etablissementName);
            }

            const normalizedInput = this.normalizeEtablissementName(etablissementName);
            
            for (const [mappedName, gestionnaire] of this.etablissementGestionnaireMap.entries()) {
                const normalizedMapped = this.normalizeEtablissementName(mappedName);
                
                if (normalizedInput.includes(normalizedMapped) || normalizedMapped.includes(normalizedInput)) {
                    console.log(`🔍 Match trouvé: "${etablissementName}" ≈ "${mappedName}" → ${gestionnaire}`);
                    return gestionnaire;
                }
                
                const inputWords = normalizedInput.split(' ').filter(w => w.length > 2);
                const mappedWords = normalizedMapped.split(' ').filter(w => w.length > 2);
                const commonWords = inputWords.filter(word => mappedWords.includes(word));
                
                if (commonWords.length >= 2) {
                    console.log(`🔍 Match par mots-clés: "${etablissementName}" ≈ "${mappedName}" → ${gestionnaire}`);
                    return gestionnaire;
                }
            }

            console.log(`⚠️ Aucun gestionnaire trouvé pour: "${etablissementName}"`);
            return 'Non spécifié';
        }

        normalizeEtablissementName(name) {
            return name
                .toLowerCase()
                .replace(/[àáâãäå]/g, 'a')
                .replace(/[èéêë]/g, 'e')
                .replace(/[ìíîï]/g, 'i')
                .replace(/[òóôõö]/g, 'o')
                .replace(/[ùúûü]/g, 'u')
                .replace(/[ç]/g, 'c')
                .replace(/creche/g, 'creche')
                .replace(/crèche/g, 'creche')
                .replace(/[^a-z0-9\s]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        identifyColumns(headers) {
            console.log('🔍 === DEBUG IDENTIFICATION DES COLONNES ===');
            console.log('📊 En-têtes reçus:', headers);
            console.log('📊 Nombre d\'en-têtes:', headers.length);
            
            const mapping = {};
            mapping.managerColumns = [];
            mapping.checkboxGroups = {};

            headers.forEach((header, index) => {
                if (!header) return;
                const h = header.toString().trim();
                
                console.log(`📍 Colonne ${index}: "${h}"`);

                if (h === 'Selectionnez votre établissement :') {
                    mapping.etablissement = index;
                    console.log(`  ✅ ETABLISSEMENT trouvé à l'index ${index}`);
                }
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
                    console.log(`  ✅ GESTIONNAIRE "${h}" trouvé à l'index ${index}`);
                }
                else if (h === 'Vous êtes ?') {
                    mapping.genre = index;
                    console.log(`  ✅ GENRE trouvé à l'index ${index}`);
                }
                else if (h === 'Votre âge ?') {
                    mapping.age = index;
                    console.log(`  ✅ AGE trouvé à l'index ${index}`);
                }
                else if (h === 'Quelle est votre catégorie socio-professionnelle ?') {
                    mapping.csp = index;
                    console.log(`  ✅ CSP trouvé à l'index ${index}`);
                }
                else if (h === 'Je suis satisfait.e de l\'accueil de mon enfant à la crèche ?') {
                    mapping.satisfaction = index;
                    console.log(`  🎯 SATISFACTION EXACTE trouvée à l'index ${index}`);
                }
                else if (h.toLowerCase().includes('satisfait') && h.toLowerCase().includes('crèche')) {
                    console.log(`  🎯 SATISFACTION POSSIBLE: "${h}" à l'index ${index}`);
                    if (!mapping.satisfaction) {
                        mapping.satisfaction = index;
                        console.log(`  ✅ SATISFACTION assignée à l'index ${index}`);
                    }
                }
                else if (h.toLowerCase().includes('satisfait') && h.toLowerCase().includes('accueil')) {
                    console.log(`  🎯 SATISFACTION POSSIBLE (accueil): "${h}" à l'index ${index}`);
                    if (!mapping.satisfaction) {
                        mapping.satisfaction = index;
                        console.log(`  ✅ SATISFACTION assignée à l'index ${index}`);
                    }
                }
                else if (h.toLowerCase().includes('satisfait')) {
                    console.log(`  🎯 CONTIENT "satisfait": "${h}" à l'index ${index}`);
                }
                else if (h.startsWith('Si non, pourquoi ?')) {
                    const base = 'Si non, pourquoi ?';
                    if (!mapping.checkboxGroups[base]) {
                        mapping.checkboxGroups[base] = [];
                    }
                    mapping.checkboxGroups[base].push({ index: index, option: h });
                    console.log(`  ✅ "Si non, pourquoi ?" trouvé à l'index ${index}`);
                }
            });

            Object.values(mapping.checkboxGroups).forEach(arr =>
                arr.sort((a, b) => a.index - b.index)
            );

            console.log('📊 === MAPPING FINAL ===');
            console.log('🏢 Etablissement:', mapping.etablissement);
            console.log('👥 Gestionnaires:', mapping.managerColumns);
            console.log('👤 Genre:', mapping.genre);
            console.log('🎂 Age:', mapping.age);
            console.log('💼 CSP:', mapping.csp);
            console.log('🎯 SATISFACTION:', mapping.satisfaction);
            console.log('📋 Groupes checkbox:', Object.keys(mapping.checkboxGroups));
            
            if (mapping.satisfaction === undefined) {
                console.log('❌ ATTENTION: Aucune colonne de satisfaction détectée !');
                console.log('🔍 Recherche alternative dans tous les en-têtes...');
                headers.forEach((header, index) => {
                    if (header && header.toString().toLowerCase().includes('satisfait')) {
                        console.log(`  🎯 Candidat ${index}: "${header}"`);
                    }
                });
            }
            
            console.log('🔍 === FIN DEBUG IDENTIFICATION ===\n');

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

            console.log('🔍 === DEBUG EXTRACTION DONNEES ===');
            console.log('📊 Ligne de données:', row);
            console.log('🗂️ Mapping des colonnes:', columnMapping);

            if (columnMapping.etablissement !== undefined) {
                const val = row[columnMapping.etablissement];
                if (val) {
                    const str = val.toString().trim();
                    if (str && str !== 'Sélectionnez votre établissement :') {
                        response.etablissement = str;
                        console.log(`🏢 Établissement trouvé: "${str}"`);
                        
                        response.gestionnaire = this.findGestionnaireForEtablissement(str);
                        console.log(`👥 Gestionnaire depuis mapping: "${response.gestionnaire}"`);
                    }
                }
            }

            if (response.gestionnaire === 'Non spécifié') {
                for (const { index, name } of columnMapping.managerColumns) {
                    const val = row[index];
                    if (val && val.toString().trim() !== '') {
                        response.gestionnaire = name;
                        console.log(`👥 Gestionnaire trouvé (fallback): "${name}"`);
                        break;
                    }
                }
            }

            if (columnMapping.genre !== undefined) {
                const val = row[columnMapping.genre];
                if (val) {
                    const s = val.toString().toLowerCase();
                    if (s.includes('femme')) response.genre = 'Femme';
                    else if (s.includes('homme')) response.genre = 'Homme';
                    console.log(`👤 Genre trouvé: "${response.genre}"`);
                }
            }

            if (columnMapping.age !== undefined) {
                const val = row[columnMapping.age];
                if (val) {
                    response.age = val.toString().trim();
                    console.log(`🎂 Âge trouvé: "${response.age}"`);
                }
            }

            if (columnMapping.csp !== undefined) {
                const val = row[columnMapping.csp];
                if (val) {
                    response.csp = val.toString().trim();
                    console.log(`💼 CSP trouvée: "${response.csp}"`);
                }
            }

            console.log('🎯 === DEBUG SATISFACTION ===');
            console.log('📍 Index de satisfaction:', columnMapping.satisfaction);
            if (columnMapping.satisfaction !== undefined) {
                const val = row[columnMapping.satisfaction];
                console.log('📥 Valeur brute de satisfaction:', val);
                console.log('📊 Type:', typeof val);
                if (val) {
                    const satisfactionValue = val.toString().trim();
                    response.satisfaction = satisfactionValue;
                    console.log(`🎯 SATISFACTION FINALE: "${satisfactionValue}"`);
                } else {
                    console.log('⚠️ Valeur de satisfaction vide ou nulle');
                }
            } else {
                console.log('❌ Pas d\'index de satisfaction trouvé dans le mapping');
                console.log('🔍 Colonnes disponibles dans le mapping:');
                Object.entries(columnMapping).forEach(([key, value]) => {
                    console.log(`  ${key}: ${value}`);
                });
            }

            const processed = new Set();
            const checkboxGroups = columnMapping.checkboxGroups || {};

            for (let i = 0; i < headers.length; i++) {
                if (processed.has(i)) continue;
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

                if (header.toLowerCase().includes('satisfait')) {
                    console.log(`🎯 COLONNE SATISFACTION ADDITIONNELLE TROUVEE:`);
                    console.log(`  📍 Index: ${i}`);
                    console.log(`  📝 En-tête: "${header}"`);
                    console.log(`  📊 Valeur: "${cellStr}"`);
                }

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
                    const normalizedKey = this.normalizeHeaderKey(matchedGroupKey);
                    const selectedOptions = [];

                    groupArray.forEach(({ index, option }) => {
                        const v = row[index];
                        const s = v ? v.toString().trim() : '';
                        if (s && s.toLowerCase() !== 'sans réponse' && s.toLowerCase() !== 'n/a') {
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

            response.columnOrder.sort((a, b) => a.index - b.index);

            console.log('📤 Réponse finale extraite:', {
                etablissement: response.etablissement,
                gestionnaire: response.gestionnaire,
                satisfaction: response.satisfaction,
                additionalDataKeys: Object.keys(response.additionalData)
            });
            console.log('🔍 === FIN DEBUG EXTRACTION ===\n');

            return response;
        }

        loadFromJSON(jsonData) {
            try {
                console.log('📥 Chargement des données depuis JSON...');
                console.log('Structure JSON:', Object.keys(jsonData));
                
                if (!jsonData.etablissements || !jsonData.rawResponses) {
                    throw new Error('Structure JSON invalide : établissements ou rawResponses manquants');
                }
                
                // Charger les données directement
                this.surveyData = jsonData.etablissements;
                this.rawData = jsonData.rawResponses;
                
                console.log(`✅ Données chargées: ${Object.keys(this.surveyData).length} établissements, ${this.rawData.length} réponses`);
                
                return {
                    totalResponses: this.rawData.length,
                    etablissements: Object.keys(this.surveyData).length
                };
            } catch (error) {
                console.error('❌ Erreur lors du chargement JSON:', error);
                throw new Error(`Impossible de charger les données JSON: ${error.message}`);
            }
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

            responses.forEach(r => {
                stats.satisfaction[r.satisfaction] = (stats.satisfaction[r.satisfaction] || 0) + 1;
                stats.gestionnaire[r.gestionnaire] = (stats.gestionnaire[r.gestionnaire] || 0) + 1;
                stats.genre[r.genre] = (stats.genre[r.genre] || 0) + 1;
                stats.csp[r.csp] = (stats.csp[r.csp] || 0) + 1;
            });

            const totalCSP = Object.values(stats.csp).reduce((a, b) => a + b, 0);
            Object.entries(stats.csp).forEach(([key, cnt]) => {
                if (key !== 'Non spécifié' && totalCSP > 0) {
                    stats.cspPercentages[key] = Math.round((cnt / totalCSP) * 100);
                }
            });

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

            const sortedKeys = Array.from(allKeys)
                .filter(k => {
                    const idx = orderMap.get(k) || 0;
                    return idx < 1 || idx > 8;
                })
                .sort((a, b) => (orderMap.get(a) || 0) - (orderMap.get(b) || 0));

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

            const firstWith = responses.find(r => r.additionalData[key]);
            if (firstWith) {
                const info = firstWith.additionalData[key];
                data.originalHeader = info.originalHeader;
                data.columnIndex = info.columnIndex;
                data.question = info.originalHeader;
            }

            const questionLower = data.question.toLowerCase();
            const isDefinitelyOpen = questionLower.includes('remarques') || 
                                   questionLower.includes('suggestions') || 
                                   questionLower.includes('complémentaires') ||
                                   questionLower.includes('commentaire') ||
                                   questionLower.includes('préciser') ||
                                   questionLower.includes('pourquoi') ||
                                   questionLower.includes('avez-vous des remarques');

            if (isDefinitelyOpen) {
                data.isOpenQuestion = true;
            }

            responses.forEach(r => {
                if (!r.additionalData[key]) return;
                const info = r.additionalData[key];
                const ans = info.value;
                if (!ans || ans === 'N/A') return;

                data.totalResponses++;

                if (isDefinitelyOpen) {
                    data.responsesList.push({
                        answer: ans,
                        respondentId: r.id,
                        genre: r.genre,
                        csp: r.csp
                    });
                    return;
                }

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
            
            if (lower.length > 30) return false;
            
            if (lower.includes(' et ') || lower.includes(' ou ') || lower.includes(' mais ') || 
                lower.includes(' car ') || lower.includes(' pour ') || lower.includes(' avec ') ||
                lower.includes(' dans ') || lower.includes(' sur ') || lower.includes(' par ') ||
                lower.includes(' donc ') || lower.includes(' alors ') || lower.includes(' ainsi ') ||
                lower.includes(' cette ') || lower.includes(' cette ') || lower.includes(' cette ')) {
                return false;
            }
            
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

        // =================================================================
        // ===== ✅ SECTION CORRIGÉE ✅ =====
        // =================================================================
        calculateSatisfactionPercentage(satData) {
            console.log('🔍 === CALCUL SATISFACTION (LOGIQUE CORRIGÉE) ===');
            console.log('📥 Données brutes reçues:', satData);
            
            if (!satData || typeof satData !== 'object') {
                console.log('❌ ARRET: Données de satisfaction invalides');
                return 0;
            }

            const normalizeAccents = (str) => {
                return str
                    .toLowerCase()
                    .replace(/[àáâãäå]/g, 'a')
                    .replace(/[èéêë]/g, 'e')
                    .replace(/[ìíîï]/g, 'i')
                    .replace(/[òóôõö]/g, 'o')
                    .replace(/[ùúûü]/g, 'u')
                    .replace(/[ç]/g, 'c')
                    .replace(/[ñ]/g, 'n')
                    .replace(/[^a-z\s]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            };

            const normalizedData = {};
            Object.entries(satData).forEach(([key, value]) => {
                if (key && value && typeof value === 'number' && value > 0) {
                    const cleanKey = key.toString().trim();
                    normalizedData[cleanKey] = value;
                }
            });
            
            console.log('🧹 Données normalisées:', normalizedData);
            
            if (Object.keys(normalizedData).length === 0) {
                console.log('❌ ARRET: Aucune donnée normalisée valide');
                return 0;
            }
            
            let tresSatisfaitCount = 0;
            let plutotSatisfaitCount = 0;
            
            Object.entries(normalizedData).forEach(([key, count]) => {
                const keyNormalized = normalizeAccents(key);
                
                if (keyNormalized.includes('tres') && keyNormalized.includes('satisfait')) {
                    tresSatisfaitCount += count;
                } else if (keyNormalized.includes('plutot') && keyNormalized.includes('satisfait')) {
                    plutotSatisfaitCount += count;
                }
            });

            // Le dénominateur est la somme de TOUTES les réponses valides,
            // pas seulement celles contenant "satisfait".
            const totalValidResponses = Object.entries(normalizedData)
                .filter(([key]) => {
                    const keyNormalized = normalizeAccents(key);
                    // On exclut seulement les réponses non pertinentes comme "Non spécifié"
                    return !keyNormalized.includes('non specifie') && 
                           !keyNormalized.includes('non specifi') && // Pour plus de sécurité
                           keyNormalized.trim() !== '';
                })
                .reduce((sum, [, count]) => sum + count, 0);

            const totalSatisfiedCount = tresSatisfaitCount + plutotSatisfaitCount;
            const satisfactionPercentage = totalValidResponses > 0 ? 
                Math.round((totalSatisfiedCount / totalValidResponses) * 100) : 0;

            console.log(`\n📊 === RESULTATS FINAUX (CORRIGÉ) ===`);
            console.log(`🎯 Très satisfait: ${tresSatisfaitCount}`);
            console.log(`🎯 Plutôt satisfait: ${plutotSatisfaitCount}`);
            console.log(`✅ Total satisfaits (Numérateur): ${totalSatisfiedCount}`);
            console.log(`📊 Total réponses valides (Dénominateur): ${totalValidResponses}`);
            console.log(`🏆 POURCENTAGE FINAL: ${satisfactionPercentage}%`);
            console.log('🔍 === FIN CALCUL SATISFACTION (CORRIGÉ) ===\n');

            return satisfactionPercentage;
        }
        // =================================================================
        // ===== ✅ FIN DE LA SECTION CORRIGÉE ✅ =====
        // =================================================================


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
            this.etablissementGestionnaireMap.clear();
        }
    }

    // ===== UIRenderer Class - VERSION TABLEAUX =====
    class UIRenderer {
        constructor() {
            this.currentEtablissement = null;
            this.currentSort = { column: null, direction: 'asc' };
            this.currentFilters = { gestionnaire: '', satisfaction: '', search: '' };
            this.tableData = [];
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
            console.log('=== RENDER SUMMARY ===');
            console.log('Survey data:', surveyData);
            
            const totalResponses = Object.values(surveyData).reduce((sum, d) => sum + d.totalReponses, 0);
            const totalEtab = Object.keys(surveyData).length;
            
            let totalSat = 0,
                totalForSat = 0;
            
            Object.values(surveyData).forEach(d => {
                console.log('Données satisfaction pour établissement:', d.satisfaction);
                
                const analyzer = new DataAnalyzer();
                const etabSatPercentage = analyzer.calculateSatisfactionPercentage(d.satisfaction);
                
                const validResponses = Object.entries(d.satisfaction)
                    .filter(([key]) => {
                        const keyLower = key.toLowerCase().replace(/[^a-z\s]/g, '');
                        return !keyLower.includes('non') && !keyLower.includes('specifie') && 
                               !keyLower.includes('specifi') && keyLower.trim() !== '';
                    })
                    .reduce((sum, [, count]) => sum + count, 0);
                    
                const satisfiedCount = Math.round((etabSatPercentage / 100) * validResponses);
                
                totalSat += satisfiedCount;
                totalForSat += validResponses;
                
                console.log(`Établissement: satisfaits=${satisfiedCount}, total=${validResponses}, %=${etabSatPercentage}%`);
            });
            
            const globalSat = totalForSat > 0 ? Math.round((totalSat / totalForSat) * 100) : 0;
            console.log(`GLOBAL: satisfaits=${totalSat}, total=${totalForSat}, pourcentage=${globalSat}%`);
            
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
            document.getElementById('satisfaction-globale').textContent = `${globalSat}%`;
            document.getElementById('date-enquete').textContent = range;
        }

        // NOUVELLE MÉTHODE : Préparer les données pour les tableaux
        prepareTableData(surveyData, analyzer) {
            this.tableData = Object.entries(surveyData).map(([name, data]) => ({
                id: name,
                etablissement: name,
                gestionnaire: Object.keys(data.gestionnaire)[0] || 'Non spécifié',
                satisfaction: analyzer.calculateSatisfactionPercentage(data.satisfaction),
                totalReponses: data.totalReponses,
                genres: this.formatGenres(data.genre),
                csp: this.formatCSP(data.cspPercentages),
                satisfactionDetail: this.formatSatisfactionDetails(data.satisfaction),
                data: data
            }));
        }

        // NOUVELLE MÉTHODE : Rendu principal des établissements avec tableaux
        renderEtablissements(surveyData, analyzer) {
            this.prepareTableData(surveyData, analyzer);
            this.renderTableView(surveyData, analyzer, 'etablissements');
        }

        // NOUVELLE MÉTHODE : Rendu par type de vue
        renderEtablissementsByView(surveyData, analyzer, viewType) {
            if (viewType === 'global') {
                // Rediriger vers la méthode globale
                if (window.surveyApp && window.surveyApp.showGlobalStats) {
                    window.surveyApp.showGlobalStats();
                }
                return;
            }
            
            this.prepareTableData(surveyData, analyzer);
            this.renderTableView(surveyData, analyzer, viewType);
        }

        // NOUVELLE MÉTHODE : Rendu principal des tableaux
        renderTableView(surveyData, analyzer, viewType) {
            const container = document.getElementById('etablissements-container');
            container.innerHTML = '';
            container.className = 'table-view-container';

            // Titre et contrôles
            this.renderTableControls(container, viewType);
            
            // Table principale
            this.renderMainTable(container, viewType);
        }

        // NOUVELLE MÉTHODE : Contrôles et filtres
        renderTableControls(container, viewType) {
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'table-controls';
            controlsDiv.innerHTML = `
                <div class="table-controls-header">
                    <h3 class="table-title">${this.getViewTitle(viewType)}</h3>
                    <div class="table-actions-top">
                        <button class="table-action-btn export-all" onclick="window.surveyApp.exportResults()">
                            📊 Exporter tout en JSON
                        </button>
                    </div>
                </div>
                <div class="table-filters">
                    <div class="filter-group">
                        <label for="search-filter">🔍 Rechercher:</label>
                        <input type="text" id="search-filter" placeholder="Nom d'établissement...">
                    </div>
                    <div class="filter-group">
                        <label for="gestionnaire-filter">👥 Gestionnaire:</label>
                        <select id="gestionnaire-filter">
                            <option value="">Tous les gestionnaires</option>
                            ${this.getGestionnaireOptions()}
                        </select>
                    </div>
                    <div class="filter-group">
                        <label for="satisfaction-filter">📊 Satisfaction:</label>
                        <select id="satisfaction-filter">
                            <option value="">Tous les niveaux</option>
                            <option value="excellent">Excellente (≥90%)</option>
                            <option value="good">Bonne (75-89%)</option>
                            <option value="average">Moyenne (50-74%)</option>
                            <option value="poor">Faible (<50%)</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <button id="clear-filters" class="clear-filters-btn">🗑️ Effacer les filtres</button>
                    </div>
                </div>
            `;
            
            container.appendChild(controlsDiv);
            
            // Événements des filtres
            this.setupFilterEvents();
        }

        // NOUVELLE MÉTHODE : Table principale
        renderMainTable(container, viewType) {
            const tableContainer = document.createElement('div');
            tableContainer.className = 'main-table-container';
            
            const table = document.createElement('table');
            table.className = 'main-data-table';
            table.id = 'main-data-table';
            
            // En-tête avec tri
            table.innerHTML = `
                <thead>
                    <tr>
                        <th data-sort="etablissement" class="sortable">
                            <span>Établissement</span>
                            <span class="sort-indicator"></span>
                        </th>
                        <th data-sort="gestionnaire" class="sortable">
                            <span>Gestionnaire</span>
                            <span class="sort-indicator"></span>
                        </th>
                        <th data-sort="satisfaction" class="sortable text-center">
                            <span>Satisfaction</span>
                            <span class="sort-indicator"></span>
                        </th>
                        <th data-sort="totalReponses" class="sortable text-center">
                            <span>Réponses</span>
                            <span class="sort-indicator"></span>
                        </th>
                        <th class="text-center">Genres</th>
                        <th class="text-center">CSP principales</th>
                        <th class="text-center">Détail satisfaction</th>
                        <th class="text-center">Actions</th>
                    </tr>
                </thead>
                <tbody id="table-body">
                </tbody>
            `;
            
            tableContainer.appendChild(table);
            container.appendChild(tableContainer);
            
            // Remplir le tableau
            this.updateTableBody();
            
            // Événements de tri
            this.setupSortEvents();
            
            // Tri initial selon la vue
            this.applySortForView(viewType);
        }

        // NOUVELLE MÉTHODE : Mise à jour du corps du tableau
        updateTableBody() {
            const tbody = document.getElementById('table-body');
            if (!tbody) return;
            
            // Appliquer les filtres
            const filteredData = this.applyFilters(this.tableData);
            
            // Appliquer le tri
            const sortedData = this.applySorting(filteredData);
            
            // Générer les lignes
            tbody.innerHTML = '';
            
            if (sortedData.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="no-data">
                            <div class="no-data-message">
                                <span class="no-data-icon">🔍</span>
                                <p>Aucun établissement ne correspond aux critères de filtrage.</p>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }
            
            sortedData.forEach((item, index) => {
                const row = this.createTableRow(item, index);
                tbody.appendChild(row);
            });
        }

        // NOUVELLE MÉTHODE : Créer une ligne de tableau
        createTableRow(item, index) {
            const row = document.createElement('tr');
            row.className = index % 2 === 0 ? 'even-row' : 'odd-row';
            
            const satisfactionClass = this.getSatisfactionClass(item.satisfaction);
            const gestionnaireClass = this.getGestionnaireClass(item.gestionnaire);
            
            row.innerHTML = `
                <td class="etablissement-cell">
                    <div class="etablissement-name">${item.etablissement}</div>
                </td>
                <td class="gestionnaire-cell">
                    <span class="table-gestionnaire ${gestionnaireClass}">
                        ${item.gestionnaire}
                    </span>
                </td>
                <td class="satisfaction-cell text-center">
                    <div class="satisfaction-display">
                        <span class="table-satisfaction ${satisfactionClass}">
                            ${item.satisfaction}%
                        </span>
                        <div class="satisfaction-bar-mini">
                            <div class="satisfaction-fill-mini" style="width: ${item.satisfaction}%"></div>
                        </div>
                    </div>
                </td>
                <td class="reponses-cell text-center">
                    <span class="reponses-count">${item.totalReponses}</span>
                </td>
                <td class="genres-cell text-center">
                    <div class="data-cell-content">${item.genres}</div>
                </td>
                <td class="csp-cell text-center">
                    <div class="data-cell-content">${item.csp}</div>
                </td>
                <td class="satisfaction-detail-cell text-center">
                    <div class="data-cell-content satisfaction-detail">${item.satisfactionDetail}</div>
                </td>
                <td class="actions-cell text-center">
                    <div class="table-actions">
                        <button class="table-btn details" onclick="window.surveyApp.showDetails('${item.id}')" title="Voir les détails">
                            👁️
                        </button>
                        <button class="table-btn pdf" onclick="window.surveyApp.exportEtablissementToPDF('${item.id}')" title="Exporter en PDF">
                            📄
                        </button>
                    </div>
                </td>
            `;
            
            return row;
        }

        // NOUVELLE MÉTHODE : Événements des filtres
        setupFilterEvents() {
            const searchFilter = document.getElementById('search-filter');
            const gestionnaireFilter = document.getElementById('gestionnaire-filter');
            const satisfactionFilter = document.getElementById('satisfaction-filter');
            const clearFiltersBtn = document.getElementById('clear-filters');
            
            const updateFilters = () => {
                this.currentFilters = {
                    search: searchFilter.value.toLowerCase(),
                    gestionnaire: gestionnaireFilter.value,
                    satisfaction: satisfactionFilter.value
                };
                this.updateTableBody();
            };
            
            if (searchFilter) {
                searchFilter.addEventListener('input', updateFilters);
            }
            if (gestionnaireFilter) {
                gestionnaireFilter.addEventListener('change', updateFilters);
            }
            if (satisfactionFilter) {
                satisfactionFilter.addEventListener('change', updateFilters);
            }
            if (clearFiltersBtn) {
                clearFiltersBtn.addEventListener('click', () => {
                    searchFilter.value = '';
                    gestionnaireFilter.value = '';
                    satisfactionFilter.value = '';
                    this.currentFilters = { search: '', gestionnaire: '', satisfaction: '' };
                    this.updateTableBody();
                });
            }
        }

        // NOUVELLE MÉTHODE : Événements de tri
        setupSortEvents() {
            const sortableHeaders = document.querySelectorAll('.sortable');
            sortableHeaders.forEach(header => {
                header.addEventListener('click', () => {
                    const column = header.dataset.sort;
                    this.toggleSort(column);
                });
            });
        }

        // NOUVELLE MÉTHODE : Basculer le tri
        toggleSort(column) {
            if (this.currentSort.column === column) {
                this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                this.currentSort.column = column;
                this.currentSort.direction = 'asc';
            }
            
            this.updateSortIndicators();
            this.updateTableBody();
        }

        // NOUVELLE MÉTHODE : Indicateurs de tri
        updateSortIndicators() {
            document.querySelectorAll('.sort-indicator').forEach(indicator => {
                indicator.textContent = '';
                indicator.parentElement.classList.remove('sorted-asc', 'sorted-desc');
            });
            
            if (this.currentSort.column) {
                const activeHeader = document.querySelector(`[data-sort="${this.currentSort.column}"]`);
                if (activeHeader) {
                    const indicator = activeHeader.querySelector('.sort-indicator');
                    indicator.textContent = this.currentSort.direction === 'asc' ? '↑' : '↓';
                    activeHeader.classList.add(`sorted-${this.currentSort.direction}`);
                }
            }
        }

        // NOUVELLE MÉTHODE : Appliquer les filtres
        applyFilters(data) {
            return data.filter(item => {
                // Filtre de recherche
                if (this.currentFilters.search && 
                    !item.etablissement.toLowerCase().includes(this.currentFilters.search)) {
                    return false;
                }
                
                // Filtre gestionnaire
                if (this.currentFilters.gestionnaire && 
                    item.gestionnaire !== this.currentFilters.gestionnaire) {
                    return false;
                }
                
                // Filtre satisfaction
                if (this.currentFilters.satisfaction) {
                    const satisfactionClass = this.getSatisfactionClass(item.satisfaction);
                    if (satisfactionClass !== this.currentFilters.satisfaction) {
                        return false;
                    }
                }
                
                return true;
            });
        }

        // NOUVELLE MÉTHODE : Appliquer le tri
        applySorting(data) {
            if (!this.currentSort.column) return data;
            
            return [...data].sort((a, b) => {
                let aVal = a[this.currentSort.column];
                let bVal = b[this.currentSort.column];
                
                // Traitement spécial pour les nombres
                if (this.currentSort.column === 'satisfaction' || this.currentSort.column === 'totalReponses') {
                    aVal = Number(aVal);
                    bVal = Number(bVal);
                }
                
                // Traitement spécial pour les chaînes
                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }
                
                let result = 0;
                if (aVal < bVal) result = -1;
                else if (aVal > bVal) result = 1;
                
                return this.currentSort.direction === 'desc' ? -result : result;
            });
        }

        // NOUVELLE MÉTHODE : Tri initial selon la vue
        applySortForView(viewType) {
            switch (viewType) {
                case 'satisfaction':
                    this.currentSort = { column: 'satisfaction', direction: 'desc' };
                    break;
                case 'gestionnaires':
                    this.currentSort = { column: 'gestionnaire', direction: 'asc' };
                    break;
                case 'repondants':
                    this.currentSort = { column: 'totalReponses', direction: 'desc' };
                    break;
                default:
                    this.currentSort = { column: 'etablissement', direction: 'asc' };
            }
            this.updateSortIndicators();
            this.updateTableBody();
        }

        // MÉTHODES UTILITAIRES
        getViewTitle(viewType) {
            const titles = {
                'etablissements': '📋 Liste des établissements',
                'satisfaction': '📊 Classement par satisfaction',
                'gestionnaires': '👥 Groupement par gestionnaires',
                'repondants': '📈 Classement par nombre de répondants',
                'global': '🌍 Statistiques globales',
                'tableaux': '📋 Vue d\'ensemble'
            };
            return titles[viewType] || '📋 Établissements';
        }

        getGestionnaireOptions() {
            const gestionnaires = [...new Set(this.tableData.map(item => item.gestionnaire))];
            return gestionnaires
                .filter(g => g !== 'Non spécifié')
                .sort()
                .map(g => `<option value="${g}">${g}</option>`)
                .join('');
        }

        getSatisfactionClass(satisfaction) {
            if (satisfaction >= 90) return 'excellent';
            if (satisfaction >= 75) return 'good';
            if (satisfaction >= 50) return 'average';
            return 'poor';
        }

        formatGenres(genreData) {
            return Object.entries(genreData)
                .filter(([genre]) => genre !== 'Non spécifié')
                .map(([genre, count]) => `${genre}: ${count}`)
                .join(', ') || 'Non spécifié';
        }

        formatCSP(cspPercentages) {
            return Object.entries(cspPercentages)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
                .map(([csp, pct]) => `${csp}: ${pct}%`)
                .join(', ') || 'Non spécifié';
        }

        formatSatisfactionDetails(satisfactionData) {
            return Object.entries(satisfactionData)
                .filter(([key]) => key !== 'Non spécifié')
                .map(([level, count]) => {
                    const short = level.replace('Très satisfait', 'T.Sat')
                                      .replace('Plutôt satisfait', 'P.Sat')
                                      .replace('Peu satisfait', 'Peu')
                                      .replace('Pas satisfait', 'Pas')
                                      .replace('Pas du tout satisfait', 'Pas');
                    return `${short}: ${count}`;
                })
                .join(' • ') || 'Aucune donnée';
        }

        // MÉTHODES MODAL (inchangées)
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

            const ordered = Object.entries(data.questionStats)
                .map(([key, qData]) => ({ key, idx: qData.columnIndex, qData }))
                .sort((a, b) => a.idx - b.idx);

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
            this.pdfExporter = window.AdvancedPDFExporter ? new window.AdvancedPDFExporter() : new PDFExporter();
            
            // NOUVEAU : Gestionnaire des statistiques globales
            this.globalStatsManager = window.GlobalStatsManager ? new window.GlobalStatsManager() : null;
            
            this.initializeEventListeners();
            console.log('✅ Application initialisée avec', window.AdvancedPDFExporter ? 'AdvancedPDFExporter' : 'PDFExporter basique');
            
            if (this.globalStatsManager) {
                console.log('✅ Module de statistiques globales chargé');
            } else {
                console.warn('⚠️ Module de statistiques globales non disponible');
            }
            
            // Exposer les méthodes globales nécessaires
            this.exposeGlobalMethods();
        }

        // NOUVELLE MÉTHODE : Exposer les méthodes globales pour les statistiques
        exposeGlobalMethods() {
            // Méthodes pour l'interaction avec les statistiques globales
            window.globalStatsExportPDF = () => {
                if (this.globalStatsManager && this.globalStatsManager.exportGlobalPDF) {
                    this.globalStatsManager.exportGlobalPDF();
                } else {
                    console.error('Export PDF global non disponible');
                }
            };
            
            // Méthode pour accéder aux données globales depuis l'interface
            window.getGlobalStatsData = () => {
                if (this.globalStatsManager && this.globalStatsManager.globalData) {
                    return this.globalStatsManager.globalData;
                }
                return null;
            };
            
            console.log('✅ Méthodes globales exposées pour les statistiques');
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

            const mappingInput = document.getElementById('mapping-input');
            const selectMappingBtn = document.getElementById('select-mapping-btn');
            const mappingUploadArea = document.getElementById('mapping-upload-area');
            const downloadTemplateBtn = document.getElementById('download-template-btn');

            // NOUVEAUX EVENT LISTENERS : Import JSON rapide
            const jsonInput = document.getElementById('json-input');
            const selectJsonBtn = document.getElementById('select-json-btn');
            const jsonUploadArea = document.getElementById('json-upload-area');

            if (selectFileBtn) selectFileBtn.addEventListener('click', () => fileInput.click());
            if (fileInput) fileInput.addEventListener('change', e => this.handleFileSelect(e.target.files[0]));
            if (uploadArea) {
                uploadArea.addEventListener('dragover', e => this.handleDragOver(e));
                uploadArea.addEventListener('dragleave', e => this.handleDragLeave(e));
                uploadArea.addEventListener('drop', e => this.handleDrop(e));
            }

            if (selectMappingBtn) selectMappingBtn.addEventListener('click', () => mappingInput.click());
            if (mappingInput) mappingInput.addEventListener('change', e => this.handleMappingFileSelect(e.target.files[0]));
            if (downloadTemplateBtn) downloadTemplateBtn.addEventListener('click', () => this.downloadMappingTemplate());
            if (mappingUploadArea) {
                mappingUploadArea.addEventListener('dragover', e => this.handleMappingDragOver(e));
                mappingUploadArea.addEventListener('dragleave', e => this.handleMappingDragLeave(e));
                mappingUploadArea.addEventListener('drop', e => this.handleMappingDrop(e));
            }

            // EVENT LISTENERS : Import JSON rapide
            if (selectJsonBtn) selectJsonBtn.addEventListener('click', () => jsonInput.click());
            if (jsonInput) jsonInput.addEventListener('change', e => this.handleJSONFileSelect(e.target.files[0]));
            if (jsonUploadArea) {
                jsonUploadArea.addEventListener('dragover', e => this.handleJSONDragOver(e));
                jsonUploadArea.addEventListener('dragleave', e => this.handleJSONDragLeave(e));
                jsonUploadArea.addEventListener('drop', e => this.handleJSONDrop(e));
            }

            if (processFileBtn) processFileBtn.addEventListener('click', () => this.processFile());
            if (newFileBtn) newFileBtn.addEventListener('click', () => this.resetToUpload());
            if (retryBtn) retryBtn.addEventListener('click', () => this.resetToUpload());
            if (exportBtn) exportBtn.addEventListener('click', () => this.exportResults());
            if (closeModal) closeModal.addEventListener('click', () => this.closeModal());
            if (exportPdfBtn) exportPdfBtn.addEventListener('click', () => this.exportCurrentEtablissementToPDF());
            
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('tab-btn')) {
                    this.switchView(e.target.dataset.view);
                }
            });
            
            window.addEventListener('click', e => {
                if (e.target === modal) this.closeModal();
            });
        }

        // NOUVELLES MÉTHODES : Gestion de l'import JSON
        handleJSONFileSelect(file) {
            if (!file) return;

            const validation = this.fileHandler.validateFile(file);
            if (!validation.valid) {
                this.showJSONError(validation.error);
                return;
            }

            if (!file.name.toLowerCase().endsWith('.json')) {
                this.showJSONError('Veuillez sélectionner un fichier JSON (.json)');
                return;
            }

            this.showJSONInfo(file.name, this.fileHandler.formatFileSize(file.size));
            this.loadJSONFile(file);
        }

        async loadJSONFile(file) {
            try {
                this.showJSONStatus('Chargement du fichier JSON...');
                
                // Utiliser le FileHandler pour lire le JSON
                this.fileHandler.selectedFile = file;
                const fileResult = await this.fileHandler.processFile(msg => this.showJSONStatus(msg));
                
                if (fileResult.type === 'json') {
                    this.showJSONStatus('Traitement des données...');
                    
                    // Charger les données directement
                    const res = this.dataAnalyzer.loadFromJSON(fileResult.data);
                    
                    this.showJSONStatus(`✅ Chargé: ${res.etablissements} établissements, ${res.totalResponses} réponses`);
                    
                    // Afficher les résultats automatiquement
                    setTimeout(() => {
                        this.renderResults();
                        console.log(`🚀 Import JSON réussi: ${res.totalResponses} réponses, ${res.etablissements} établissements`);
                    }, 1000);
                } else {
                    throw new Error('Type de fichier inattendu');
                }
            } catch (error) {
                this.showJSONError(`Erreur: ${error.message}`);
                console.error('❌ Erreur import JSON:', error);
            }
        }

        handleJSONDragOver(e) {
            e.preventDefault();
            document.getElementById('json-upload-area').style.background = 'rgba(255, 255, 255, 0.25)';
        }

        handleJSONDragLeave(e) {
            e.preventDefault();
            document.getElementById('json-upload-area').style.background = 'rgba(255, 255, 255, 0.15)';
        }

        handleJSONDrop(e) {
            e.preventDefault();
            document.getElementById('json-upload-area').style.background = 'rgba(255, 255, 255, 0.15)';
            const files = e.dataTransfer.files;
            if (files.length > 0) this.handleJSONFileSelect(files[0]);
        }

        showJSONInfo(fileName, fileSize) {
            document.getElementById('json-file-name').textContent = `⚡ ${fileName} (${fileSize})`;
            document.getElementById('json-info').style.display = 'block';
        }

        showJSONStatus(status) {
            document.getElementById('json-status').textContent = status;
            document.getElementById('json-status').style.color = '#ffffff';
        }

        showJSONError(error) {
            document.getElementById('json-status').textContent = `❌ ${error}`;
            document.getElementById('json-status').style.color = '#ffcccc';
        }

        hideJSONInfo() {
            document.getElementById('json-info').style.display = 'none';
        }

        handleMappingFileSelect(file) {
            if (!file) return;

            const validation = this.fileHandler.validateFile(file);
            if (!validation.valid) {
                this.showMappingError(validation.error);
                return;
            }

            this.showMappingInfo(file.name, this.fileHandler.formatFileSize(file.size));
            this.loadMappingFile(file);
        }

        async loadMappingFile(file) {
            try {
                this.showMappingStatus('Chargement du mapping...');
                const mappedCount = await this.dataAnalyzer.loadEtablissementMapping(file);
                this.showMappingStatus(`✅ ${mappedCount} établissements mappés`);
                
                console.log('📋 === APERÇU DU MAPPING CHARGÉ ===');
                const mapping = this.dataAnalyzer.etablissementGestionnaireMap;
                const preview = Array.from(mapping.entries()).slice(0, 10);
                preview.forEach(([etab, gest]) => {
                    console.log(`📍 "${etab}" → "${gest}"`);
                });
                if (mapping.size > 10) {
                    console.log(`... et ${mapping.size - 10} autres établissements`);
                }
                console.log('📋 === FIN APERÇU ===');
                
                console.log('✅ Fichier de mapping chargé avec succès');
                console.log('💡 Conseil: Vérifiez l\'aperçu ci-dessus pour valider le mapping');
            } catch (error) {
                this.showMappingError(`Erreur: ${error.message}`);
                console.error('❌ Erreur mapping:', error);
            }
        }

        handleMappingDragOver(e) {
            e.preventDefault();
            document.getElementById('mapping-upload-area').style.background = 'rgba(255, 255, 255, 0.25)';
        }

        handleMappingDragLeave(e) {
            e.preventDefault();
            document.getElementById('mapping-upload-area').style.background = 'rgba(255, 255, 255, 0.15)';
        }

        handleMappingDrop(e) {
            e.preventDefault();
            document.getElementById('mapping-upload-area').style.background = 'rgba(255, 255, 255, 0.15)';
            const files = e.dataTransfer.files;
            if (files.length > 0) this.handleMappingFileSelect(files[0]);
        }

        showMappingInfo(fileName, fileSize) {
            document.getElementById('mapping-file-name').textContent = `📊 ${fileName} (${fileSize})`;
            document.getElementById('mapping-info').style.display = 'block';
        }

        showMappingStatus(status) {
            document.getElementById('mapping-status').textContent = status;
        }

        showMappingError(error) {
            document.getElementById('mapping-status').textContent = `❌ ${error}`;
            document.getElementById('mapping-status').style.color = '#ffcccc';
        }

        hideMappingInfo() {
            document.getElementById('mapping-info').style.display = 'none';
        }

        downloadMappingTemplate() {
            const templateData = [
                ['Etablissement', 'Gestionnaire'],
                ['Exemple - Crèche Les Petits Pas', 'Ville de Strasbourg'],
                ['Exemple - Micro-crèche Nord', 'ALEF'],
                ['Exemple - Structure AGES', 'AGES'],
                ['Exemple - Crèche AGF', 'AGF'],
                ['Exemple - Crèche Fondation', 'Fondation d\'Auteuil'],
                ['Exemple - Crèche Fossé', 'Fossé des treize'],
                ['Exemple - Structure APEDI', 'APEDI'],
                ['Exemple - Crèche AASBR', 'AASBR [AASBR]'],
                ['', ''],
                ['# INSTRUCTIONS:', ''],
                ['# Remplacez les exemples par vos vrais établissements', ''],
                ['# Colonnes requises: Etablissement + Gestionnaire', ''],
                ['# Enregistrez en Excel (.xlsx) pour l\'import', '']
            ];

            const csvContent = templateData
                .map(row => row.map(cell => `"${cell}"`).join(','))
                .join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', 'template_mapping_gestionnaires.csv');
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                console.log('📥 Template de mapping téléchargé');
                this.showMappingStatus('📥 Template téléchargé - à compléter puis convertir en Excel');
            }
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
                const fileResult = await this.fileHandler.processFile(msg => this.uiRenderer.showLoading(msg));
                
                if (fileResult.type === 'json') {
                    // Traitement des données JSON
                    this.uiRenderer.showLoading('Chargement des données JSON...');
                    setTimeout(() => {
                        try {
                            const res = this.dataAnalyzer.loadFromJSON(fileResult.data);
                            this.renderResults();
                            console.log(`✅ JSON chargé: ${res.totalResponses} réponses, ${res.etablissements} établissements`);
                        } catch (err) {
                            this.uiRenderer.showError(`Erreur lors du chargement JSON: ${err.message}`);
                        }
                    }, 500);
                } else {
                    // Traitement des données Excel (logique existante)
                    this.uiRenderer.showLoading('Analyse des données Excel...');
                    setTimeout(() => {
                        try {
                            const res = this.dataAnalyzer.analyzeData(fileResult.data);
                            this.renderResults();
                            console.log(`✅ Excel analysé: ${res.totalResponses} réponses, ${res.etablissements} établissements`);
                        } catch (err) {
                            this.uiRenderer.showError(`Erreur lors de l'analyse: ${err.message}`);
                        }
                    }, 500);
                }
            } catch (err) {
                console.error('Erreur traitement:', err);
                this.uiRenderer.showError(err.message);
            }
        }

        switchView(viewType) {
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector(`[data-view="${viewType}"]`).classList.add('active');
            
            const surveyData = this.dataAnalyzer.getSurveyData();
            
            if (viewType === 'global') {
                // NOUVEAU : Affichage des statistiques globales
                this.showGlobalStats();
            } else {
                // Vue standard (tableaux d'établissements)
                this.uiRenderer.renderEtablissementsByView(surveyData, this.dataAnalyzer, viewType);
            }
        }

        // NOUVELLE MÉTHODE : Afficher les statistiques globales
        showGlobalStats() {
            if (!this.globalStatsManager) {
                console.error('❌ Module de statistiques globales non disponible');
                const container = document.getElementById('etablissements-container');
                container.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; color: #666;">
                        <h3>❌ Module non disponible</h3>
                        <p>Le module des statistiques globales n'a pas pu être chargé.</p>
                        <p>Vérifiez que le fichier global-stats.js est correctement inclus.</p>
                    </div>
                `;
                return;
            }

            console.log('🌍 Affichage des statistiques globales...');
            
            const surveyData = this.dataAnalyzer.getSurveyData();
            const rawData = this.dataAnalyzer.getRawData();
            
            if (!surveyData || Object.keys(surveyData).length === 0) {
                console.warn('⚠️ Aucune donnée à analyser');
                const container = document.getElementById('etablissements-container');
                container.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; color: #666;">
                        <h3>📊 Aucune donnée</h3>
                        <p>Veuillez d'abord charger et analyser un fichier de données.</p>
                    </div>
                `;
                return;
            }

            try {
                // Analyser les données globalement
                this.globalStatsManager.analyzeGlobalData(surveyData, rawData);
                
                // Afficher l'interface
                const container = document.getElementById('etablissements-container');
                this.globalStatsManager.renderGlobalStats(container);
                
                console.log('✅ Statistiques globales affichées');
            } catch (error) {
                console.error('❌ Erreur lors de l\'affichage des statistiques globales:', error);
                const container = document.getElementById('etablissements-container');
                container.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; color: #dc3545;">
                        <h3>❌ Erreur</h3>
                        <p>Une erreur est survenue lors de l'analyse des données :</p>
                        <p><code>${error.message}</code></p>
                        <button onclick="window.surveyApp.switchView('etablissements')" 
                                style="margin-top: 20px; padding: 10px 20px; background: #4facfe; color: white; border: none; border-radius: 5px; cursor: pointer;">
                            Retour à la liste des établissements
                        </button>
                    </div>
                `;
            }
        }

        renderResults() {
            const sd = this.dataAnalyzer.getSurveyData();
            const rd = this.dataAnalyzer.getRawData();
            
            // Rendu standard
            this.uiRenderer.renderSummary(sd, rd);
            this.uiRenderer.renderEtablissements(sd, this.dataAnalyzer);
            
            // NOUVEAU : Préparer les données globales si le module est disponible
            if (this.globalStatsManager && Object.keys(sd).length > 0) {
                try {
                    console.log('🌍 Préparation des données globales...');
                    this.globalStatsManager.analyzeGlobalData(sd, rd);
                    console.log('✅ Données globales préparées');
                } catch (error) {
                    console.warn('⚠️ Erreur lors de la préparation des données globales:', error);
                }
            }
            
            this.uiRenderer.showResults();
        }

        // NOUVELLE MÉTHODE : Rafraîchir les statistiques globales
        refreshGlobalStats() {
            if (!this.globalStatsManager) return;
            
            const sd = this.dataAnalyzer.getSurveyData();
            const rd = this.dataAnalyzer.getRawData();
            
            if (Object.keys(sd).length > 0) {
                try {
                    console.log('🔄 Actualisation des statistiques globales...');
                    this.globalStatsManager.analyzeGlobalData(sd, rd);
                    
                    // Si on est actuellement sur la vue globale, la rafraîchir
                    const activeTab = document.querySelector('.tab-btn.active');
                    if (activeTab && activeTab.dataset.view === 'global') {
                        const container = document.getElementById('etablissements-container');
                        this.globalStatsManager.renderGlobalStats(container);
                    }
                    
                    console.log('✅ Statistiques globales actualisées');
                } catch (error) {
                    console.warn('⚠️ Erreur lors de l\'actualisation des statistiques globales:', error);
                }
            }
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

        // NOUVELLE MÉTHODE : Export spécifique des statistiques globales
        exportGlobalStatsPDF() {
            if (!this.globalStatsManager) {
                console.error('❌ Module de statistiques globales non disponible');
                alert('Le module de statistiques globales n\'est pas disponible.');
                return;
            }

            if (!this.globalStatsManager.globalData) {
                console.warn('⚠️ Aucune donnée globale à exporter');
                alert('Veuillez d\'abord analyser des données avant d\'exporter le rapport global.');
                return;
            }

            try {
                this.globalStatsManager.exportGlobalPDF();
                console.log('✅ Export PDF global lancé');
            } catch (error) {
                console.error('❌ Erreur lors de l\'export PDF global:', error);
                alert('Erreur lors de l\'export du rapport global: ' + error.message);
            }
        }

        // NOUVELLE MÉTHODE : Obtenir les données globales
        getGlobalStatsData() {
            if (this.globalStatsManager && this.globalStatsManager.globalData) {
                return this.globalStatsManager.globalData;
            }
            return null;
        }

        // NOUVELLE MÉTHODE : Vérifier si les statistiques globales sont disponibles
        hasGlobalStats() {
            return this.globalStatsManager && this.globalStatsManager.globalData;
        }

        resetToUpload() {
            this.fileHandler.reset();
            this.dataAnalyzer.reset();
            
            // NOUVEAU : Réinitialiser le gestionnaire de statistiques globales
            if (this.globalStatsManager) {
                this.globalStatsManager.reset();
            }
            
            document.getElementById('file-input').value = '';
            document.getElementById('mapping-input').value = '';
            if (document.getElementById('json-input')) {
                document.getElementById('json-input').value = '';
            }
            
            // Réinitialiser l'onglet actif
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            const defaultTab = document.querySelector('[data-view="etablissements"]');
            if (defaultTab) {
                defaultTab.classList.add('active');
            }
            
            this.uiRenderer.hideFileInfo();
            this.hideMappingInfo();
            this.hideJSONInfo();
            this.uiRenderer.showUpload();
            
            console.log('🔄 Application réinitialisée');
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

    // ===== FONCTIONS GLOBALES POUR LES STATISTIQUES =====
    // Ces fonctions sont appelées depuis l'interface des statistiques globales
    
    window.toggleQuestion = function(questionId) {
        const details = document.getElementById(questionId);
        if (!details) return;
        
        const header = details.previousElementSibling;
        const icon = header ? header.querySelector('.toggle-icon') : null;
        
        if (details.style.display === 'none' || !details.style.display) {
            details.style.display = 'block';
            if (icon) icon.textContent = '▲';
        } else {
            details.style.display = 'none';
            if (icon) icon.textContent = '▼';
        }
    };

    window.filterOpenResponses = function(questionTitle, gestionnaire) {
        console.log(`🔍 Filtrage des réponses pour: "${questionTitle}", gestionnaire: "${gestionnaire}"`);
        
        // Trouver le conteneur des réponses pour cette question
        const questionItems = document.querySelectorAll('.question-item');
        questionItems.forEach(item => {
            const header = item.querySelector('.question-header h4');
            if (header && header.textContent.includes(questionTitle)) {
                const responsesList = item.querySelector('.open-responses-list');
                if (responsesList) {
                    const responses = responsesList.querySelectorAll('.open-response-item');
                    responses.forEach(response => {
                        const meta = response.querySelector('.response-meta');
                        if (meta) {
                            const shouldShow = !gestionnaire || meta.textContent.includes(gestionnaire);
                            response.style.display = shouldShow ? 'block' : 'none';
                        }
                    });
                }
            }
        });
    };

    window.showAllResponses = function(questionTitle) {
        console.log(`📋 Affichage de toutes les réponses pour: "${questionTitle}"`);
        
        // Implémenter l'affichage de toutes les réponses
        // Cette fonction peut être étendue selon les besoins
        const questionItems = document.querySelectorAll('.question-item');
        questionItems.forEach(item => {
            const header = item.querySelector('.question-header h4');
            if (header && header.textContent.includes(questionTitle)) {
                const responsesList = item.querySelector('.open-responses-list');
                if (responsesList) {
                    responsesList.style.maxHeight = 'none';
                    const showMoreBtn = item.querySelector('.show-more-responses');
                    if (showMoreBtn) {
                        showMoreBtn.style.display = 'none';
                    }
                }
            }
        });
    };

    // Fonction pour l'export PDF global accessible depuis l'interface
    window.exportGlobalPDF = function() {
        if (window.surveyApp && window.surveyApp.exportGlobalStatsPDF) {
            window.surveyApp.exportGlobalStatsPDF();
        } else {
            console.error('❌ Export PDF global non disponible');
            alert('L\'export PDF global n\'est pas disponible.');
        }
    };

    // Fonction pour rafraîchir les statistiques globales
    window.refreshGlobalStats = function() {
        if (window.surveyApp && window.surveyApp.refreshGlobalStats) {
            window.surveyApp.refreshGlobalStats();
        }
    };

    // Fonction pour basculer vers une vue spécifique
    window.switchToView = function(viewType) {
        if (window.surveyApp && window.surveyApp.switchView) {
            window.surveyApp.switchView(viewType);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }
})();