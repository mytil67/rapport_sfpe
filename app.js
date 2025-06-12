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
            this.etablissementGestionnaireMap = new Map(); // Nouveau mapping depuis fichier de référence
        }

        // NOUVELLE MÉTHODE : Charger le mapping établissement-gestionnaire depuis un fichier Excel
        async loadEtablissementMapping(file) {
            try {
                console.log('📁 Chargement du mapping établissement-gestionnaire...');
                
                const data = await this.readExcelFile(file);
                if (!data || data.length === 0) {
                    throw new Error('Le fichier de mapping est vide');
                }

                const headers = data[0];
                console.log('📋 En-têtes trouvés:', headers);

                // Identifier les colonnes établissement et gestionnaire
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

                // Construire le mapping
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

        // MÉTHODE UTILITAIRE : Lire un fichier Excel (dupliquée depuis FileHandler)
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

        // MÉTHODE AMÉLIORÉE : Trouver le gestionnaire en utilisant le mapping de référence
        findGestionnaireForEtablissement(etablissementName) {
            if (!etablissementName || this.etablissementGestionnaireMap.size === 0) {
                return 'Non spécifié';
            }

            // 1. Recherche exacte
            if (this.etablissementGestionnaireMap.has(etablissementName)) {
                return this.etablissementGestionnaireMap.get(etablissementName);
            }

            // 2. Recherche fuzzy (approximative)
            const normalizedInput = this.normalizeEtablissementName(etablissementName);
            
            for (const [mappedName, gestionnaire] of this.etablissementGestionnaireMap.entries()) {
                const normalizedMapped = this.normalizeEtablissementName(mappedName);
                
                // Recherche par inclusion (nom contenu dans l'autre)
                if (normalizedInput.includes(normalizedMapped) || normalizedMapped.includes(normalizedInput)) {
                    console.log(`🔍 Match trouvé: "${etablissementName}" ≈ "${mappedName}" → ${gestionnaire}`);
                    return gestionnaire;
                }
                
                // Recherche par mots-clés communs
                const inputWords = normalizedInput.split(' ').filter(w => w.length > 2);
                const mappedWords = normalizedMapped.split(' ').filter(w => w.length > 2);
                const commonWords = inputWords.filter(word => mappedWords.includes(word));
                
                if (commonWords.length >= 2) { // Au moins 2 mots en commun
                    console.log(`🔍 Match par mots-clés: "${etablissementName}" ≈ "${mappedName}" → ${gestionnaire}`);
                    return gestionnaire;
                }
            }

            console.log(`⚠️ Aucun gestionnaire trouvé pour: "${etablissementName}"`);
            return 'Non spécifié';
        }

        // MÉTHODE UTILITAIRE : Normaliser les noms d'établissements pour la comparaison
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
            mapping.managerColumns = []; // indices des colonnes gestionnaires
            mapping.checkboxGroups = {};

            headers.forEach((header, index) => {
                if (!header) return;
                const h = header.toString().trim();
                
                console.log(`📍 Colonne ${index}: "${h}"`);

                // 1) Colonne "Sélectionnez votre établissement :"
                if (h === 'Selectionnez votre établissement :') {
                    mapping.etablissement = index;
                    console.log(`  ✅ ETABLISSEMENT trouvé à l'index ${index}`);
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
                    console.log(`  ✅ GESTIONNAIRE "${h}" trouvé à l'index ${index}`);
                }
                // 3) Genre
                else if (h === 'Vous êtes ?') {
                    mapping.genre = index;
                    console.log(`  ✅ GENRE trouvé à l'index ${index}`);
                }
                // 4) Âge du répondant
                else if (h === 'Votre âge ?') {
                    mapping.age = index;
                    console.log(`  ✅ AGE trouvé à l'index ${index}`);
                }
                // 5) Catégorie socio-professionnelle
                else if (h === 'Quelle est votre catégorie socio-professionnelle ?') {
                    mapping.csp = index;
                    console.log(`  ✅ CSP trouvé à l'index ${index}`);
                }
                // 6) Satisfaction globale - RECHERCHE ELARGIE
                else if (h === 'Je suis satisfait.e de l\'accueil de mon enfant à la crèche ?') {
                    mapping.satisfaction = index;
                    console.log(`  🎯 SATISFACTION EXACTE trouvée à l'index ${index}`);
                }
                // RECHERCHE ELARGIE pour satisfaction
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
                // 7) Capturer toutes les colonnes "Si non, pourquoi ? [<suffix>]" pour former des groupes
                else if (h.startsWith('Si non, pourquoi ?')) {
                    // On extrait la base "Si non, pourquoi ?" pour normaliser
                    const base = 'Si non, pourquoi ?';
                    if (!mapping.checkboxGroups[base]) {
                        mapping.checkboxGroups[base] = [];
                    }
                    mapping.checkboxGroups[base].push({ index: index, option: h });
                    console.log(`  ✅ "Si non, pourquoi ?" trouvé à l'index ${index}`);
                }
                // 8) Tous les autres en-têtes considérés comme questions seules ou à choix multiples
                //     Sera traité dynamiquement.
            });

            // Trier chaque groupe checkbox par index croissant
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

            // 1) Établissement
            if (columnMapping.etablissement !== undefined) {
                const val = row[columnMapping.etablissement];
                if (val) {
                    const str = val.toString().trim();
                    if (str && str !== 'Sélectionnez votre établissement :') {
                        response.etablissement = str;
                        console.log(`🏢 Établissement trouvé: "${str}"`);
                        
                        // NOUVEAU : Utiliser le mapping de référence pour trouver le gestionnaire
                        response.gestionnaire = this.findGestionnaireForEtablissement(str);
                        console.log(`👥 Gestionnaire depuis mapping: "${response.gestionnaire}"`);
                    }
                }
            }

            // 2) Gestionnaire : SEULEMENT en fallback si pas de mapping
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

            // 3) Genre
            if (columnMapping.genre !== undefined) {
                const val = row[columnMapping.genre];
                if (val) {
                    const s = val.toString().toLowerCase();
                    if (s.includes('femme')) response.genre = 'Femme';
                    else if (s.includes('homme')) response.genre = 'Homme';
                    console.log(`👤 Genre trouvé: "${response.genre}"`);
                }
            }

            // 4) Âge du répondant
            if (columnMapping.age !== undefined) {
                const val = row[columnMapping.age];
                if (val) {
                    response.age = val.toString().trim();
                    console.log(`🎂 Âge trouvé: "${response.age}"`);
                }
            }

            // 5) CSP
            if (columnMapping.csp !== undefined) {
                const val = row[columnMapping.csp];
                if (val) {
                    response.csp = val.toString().trim();
                    console.log(`💼 CSP trouvée: "${response.csp}"`);
                }
            }

            // 6) Satisfaction - DEBUGGING MASSIF
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

                // DEBUGGING: Chercher d'autres colonnes de satisfaction
                if (header.toLowerCase().includes('satisfait')) {
                    console.log(`🎯 COLONNE SATISFACTION ADDITIONNELLE TROUVEE:`);
                    console.log(`  📍 Index: ${i}`);
                    console.log(`  📝 En-tête: "${header}"`);
                    console.log(`  📊 Valeur: "${cellStr}"`);
                }

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

            console.log('📤 Réponse finale extraite:', {
                etablissement: response.etablissement,
                gestionnaire: response.gestionnaire,
                satisfaction: response.satisfaction,
                additionalDataKeys: Object.keys(response.additionalData)
            });
            console.log('🔍 === FIN DEBUG EXTRACTION ===\n');

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

        // METHODE CORRIGEE avec normalisation des accents
        calculateSatisfactionPercentage(satData) {
            console.log('🔍 === CALCUL SATISFACTION AVEC NORMALISATION ACCENTS ===');
            console.log('📥 Données brutes reçues:', satData);
            
            if (!satData || typeof satData !== 'object') {
                console.log('❌ ARRET: Données de satisfaction invalides');
                return 0;
            }

            // Fonction pour normaliser les accents
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

            // Nettoyer et normaliser les clés
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
            
            // Recherche avec normalisation des accents
            let tresSatisfaitCount = 0;
            let plutotSatisfaitCount = 0;
            let totalCount = 0;
            let rejectedCount = 0;
            
            console.log('🔍 RECHERCHE AVEC NORMALISATION ACCENTS:');
            Object.entries(normalizedData).forEach(([key, count]) => {
                const keyNormalized = normalizeAccents(key);
                console.log(`🎯 "${key}" → "${keyNormalized}"`);
                
                // Tests avec accents normalisés
                const isTres = keyNormalized.includes('tres');
                const isPlutor = keyNormalized.includes('plutot');
                const isSatisfait = keyNormalized.includes('satisfait');
                const isNon = keyNormalized.includes('non') || keyNormalized.includes('pas');
                const isSpecifie = keyNormalized.includes('specifie');
                
                console.log(`  🧪 Après normalisation: tres=${isTres}, plutot=${isPlutor}, satisfait=${isSatisfait}, non=${isNon}, specifie=${isSpecifie}`);
                
                if (isSatisfait && !isNon && !isSpecifie) {
                    totalCount += count;
                    console.log(`  📊 Ajouté au total: ${count}`);
                    
                    if (isTres) {
                        tresSatisfaitCount += count;
                        console.log(`  ✅ TRES SATISFAIT: +${count}`);
                    } else if (isPlutor) {
                        plutotSatisfaitCount += count;
                        console.log(`  ✅ PLUTOT SATISFAIT: +${count}`);
                    } else if (keyNormalized.includes('peu') && isSatisfait) {
                        console.log(`  ⚠️ PEU SATISFAIT: compté dans total seulement`);
                    } else {
                        console.log(`  ❓ AUTRE SATISFACTION: "${keyNormalized}" compté dans total seulement`);
                    }
                } else {
                    rejectedCount += count;
                    console.log(`  ❌ REJETE: non=${isNon}, specifie=${isSpecifie}, satisfait=${isSatisfait}`);
                }
            });

            const totalSatisfiedCount = tresSatisfaitCount + plutotSatisfaitCount;
            const satisfactionPercentage = totalCount > 0 ? 
                Math.round((totalSatisfiedCount / totalCount) * 100) : 0;

            console.log(`\n📊 === RESULTATS FINAUX ===`);
            console.log(`🎯 Très satisfait: ${tresSatisfaitCount}`);
            console.log(`🎯 Plutôt satisfait: ${plutotSatisfaitCount}`);
            console.log(`✅ Total satisfaits: ${totalSatisfiedCount}`);
            console.log(`📊 Total réponses valides: ${totalCount}`);
            console.log(`❌ Réponses rejetées: ${rejectedCount}`);
            console.log(`🏆 POURCENTAGE FINAL: ${satisfactionPercentage}%`);
            console.log('🔍 === FIN CALCUL SATISFACTION ===\n');

            return satisfactionPercentage;
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
            this.etablissementGestionnaireMap.clear(); // Reset du mapping
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
            console.log('=== RENDER SUMMARY ===');
            console.log('Survey data:', surveyData);
            
            const totalResponses = Object.values(surveyData).reduce((sum, d) => sum + d.totalReponses, 0);
            const totalEtab = Object.keys(surveyData).length;
            
            let totalSat = 0,
                totalForSat = 0;
            
            Object.values(surveyData).forEach(d => {
                console.log('Données satisfaction pour établissement:', d.satisfaction);
                
                // Utiliser la méthode robuste de calcul
                const analyzer = new DataAnalyzer();
                const etabSatPercentage = analyzer.calculateSatisfactionPercentage(d.satisfaction);
                
                // Compter les totaux pour le calcul global
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

        renderEtablissements(surveyData, analyzer) {
            // Utiliser la nouvelle méthode avec vue par défaut
            this.renderEtablissementsByView(surveyData, analyzer, 'etablissements');
        }

        renderEtablissementsByView(surveyData, analyzer, viewType) {
            const container = document.getElementById('etablissements-container');
            
            let sortedData = [];
            let sectionTitle = '';
            
            switch (viewType) {
                case 'satisfaction':
                    sortedData = this.sortBySatisfaction(surveyData, analyzer);
                    sectionTitle = '📊 Classement par taux de satisfaction';
                    break;
                case 'gestionnaires':
                    sortedData = this.sortByGestionnaire(surveyData, analyzer);
                    sectionTitle = '👥 Classement par gestionnaires';
                    break;
                case 'repondants':
                    sortedData = this.sortByRepondants(surveyData, analyzer);
                    sectionTitle = '📈 Classement par nombre de répondants';
                    break;
                case 'tableaux':
                    this.renderTableView(container, surveyData, analyzer);
                    return; // Sort early for table view
                default:
                    sortedData = this.sortByEtablissement(surveyData, analyzer);
                    sectionTitle = '📋 Liste des établissements';
            }
            
            this.renderSortedEtablissements(container, sortedData, sectionTitle, viewType);
        }

        renderTableView(container, surveyData, analyzer) {
            container.innerHTML = '';
            container.className = 'table-view';
            
            // Titre de section
            const titleElement = document.createElement('div');
            titleElement.className = 'section-title';
            titleElement.innerHTML = `<h3>📋 Vue d'ensemble en tableaux</h3>`;
            container.appendChild(titleElement);
            
            // Table de synthèse globale
            this.createSummaryTable(container, surveyData, analyzer);
            
            // Tables détaillées par gestionnaire
            this.createDetailedTables(container, surveyData, analyzer);
        }

        createSummaryTable(container, surveyData, analyzer) {
            const summaryTitle = document.createElement('h4');
            summaryTitle.textContent = '📊 Synthèse globale';
            summaryTitle.style.marginBottom = '15px';
            summaryTitle.style.color = '#333';
            container.appendChild(summaryTitle);
            
            // Préparer les données
            const tableData = Object.entries(surveyData)
                .map(([name, data]) => ({
                    name,
                    data,
                    satisfaction: analyzer.calculateSatisfactionPercentage(data.satisfaction),
                    gestionnaire: Object.keys(data.gestionnaire)[0] || 'Non spécifié',
                    totalReponses: data.totalReponses,
                    genres: this.formatGenres(data.genre),
                    csp: this.formatCSP(data.cspPercentages)
                }))
                .sort((a, b) => b.satisfaction - a.satisfaction);
            
            // Créer le tableau
            const table = document.createElement('table');
            table.className = 'summary-table';
            
            // En-tête
            table.innerHTML = `
                <thead>
                    <tr>
                        <th style="min-width: 200px;">Établissement</th>
                        <th style="min-width: 120px;">Gestionnaire</th>
                        <th style="text-align: center; min-width: 80px;">Satisfaction</th>
                        <th style="text-align: center; min-width: 80px;">Réponses</th>
                        <th style="min-width: 120px;">Genres</th>
                        <th style="min-width: 150px;">CSP principales</th>
                        <th style="text-align: center; min-width: 100px;">Actions</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
            
            const tbody = table.querySelector('tbody');
            
            // Lignes de données
            tableData.forEach((item, index) => {
                const satisfactionClass = this.getSatisfactionClass(item.satisfaction);
                const gestionnaireClass = this.getGestionnaireClass(item.gestionnaire);
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td data-label="Établissement" style="font-weight: 600;">${item.name}</td>
                    <td data-label="Gestionnaire">
                        <span class="table-gestionnaire ${gestionnaireClass}">
                            ${item.gestionnaire}
                        </span>
                    </td>
                    <td data-label="Satisfaction" style="text-align: center;">
                        <span class="table-satisfaction ${satisfactionClass}">
                            ${item.satisfaction}%
                        </span>
                    </td>
                    <td data-label="Réponses" style="text-align: center; font-weight: 600;">
                        ${item.totalReponses}
                    </td>
                    <td data-label="Genres" style="font-size: 0.85rem;">
                        ${item.genres}
                    </td>
                    <td data-label="CSP" style="font-size: 0.85rem;">
                        ${item.csp}
                    </td>
                    <td data-label="Actions" style="text-align: center;">
                        <div class="table-actions">
                            <button class="table-btn details" onclick="window.surveyApp.showDetails('${item.name}')">
                                👁️ Voir
                            </button>
                            <button class="table-btn pdf" onclick="window.surveyApp.exportEtablissementToPDF('${item.name}')">
                                📄 PDF
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);
            });
            
            container.appendChild(table);
        }

        createDetailedTables(container, surveyData, analyzer) {
            // Grouper par gestionnaire
            const groupedData = this.groupByGestionnaire(surveyData, analyzer);
            
            Object.entries(groupedData).forEach(([gestionnaire, etablissements]) => {
                const section = document.createElement('div');
                section.className = 'gestionnaire-table-section';
                
                // En-tête de gestionnaire
                const gestionnaireClass = this.getGestionnaireClass(gestionnaire);
                const totalEtab = etablissements.length;
                const totalReponses = etablissements.reduce((sum, etab) => sum + etab.totalReponses, 0);
                const avgSatisfaction = Math.round(
                    etablissements.reduce((sum, etab) => sum + etab.satisfaction, 0) / totalEtab
                );
                
                const header = document.createElement('div');
                header.className = `gestionnaire-table-header ${gestionnaireClass}`;
                header.innerHTML = `
                    <h4 class="gestionnaire-table-title">👥 ${gestionnaire}</h4>
                    <div class="gestionnaire-table-stats">
                        ${totalEtab} établissement${totalEtab > 1 ? 's' : ''} • 
                        ${totalReponses} réponses • 
                        ${avgSatisfaction}% satisfaction moyenne
                    </div>
                `;
                section.appendChild(header);
                
                // Table pour ce gestionnaire
                const table = document.createElement('table');
                table.className = 'summary-table';
                table.style.borderRadius = '0 0 10px 10px';
                
                table.innerHTML = `
                    <thead style="display: none;">
                        <tr>
                            <th>Établissement</th>
                            <th>Satisfaction</th>
                            <th>Réponses</th>
                            <th>Détails satisfaction</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                `;
                
                const tbody = table.querySelector('tbody');
                
                etablissements
                    .sort((a, b) => b.satisfaction - a.satisfaction)
                    .forEach((item, index) => {
                        const satisfactionClass = this.getSatisfactionClass(item.satisfaction);
                        const detailSat = this.formatSatisfactionDetails(item.data.satisfaction);
                        
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td data-label="Établissement" style="font-weight: 600; width: 35%;">${item.name}</td>
                            <td data-label="Satisfaction" style="text-align: center; width: 15%;">
                                <span class="table-satisfaction ${satisfactionClass}">
                                    ${item.satisfaction}%
                                </span>
                            </td>
                            <td data-label="Réponses" style="text-align: center; width: 10%; font-weight: 600;">
                                ${item.totalReponses}
                            </td>
                            <td data-label="Détails" style="font-size: 0.85rem; width: 25%;">
                                ${detailSat}
                            </td>
                            <td data-label="Actions" style="text-align: center; width: 15%;">
                                <div class="table-actions">
                                    <button class="table-btn details" onclick="window.surveyApp.showDetails('${item.name}')">
                                        👁️ Voir
                                    </button>
                                    <button class="table-btn pdf" onclick="window.surveyApp.exportEtablissementToPDF('${item.name}')">
                                        📄 PDF
                                    </button>
                                </div>
                            </td>
                        `;
                        tbody.appendChild(row);
                    });
                
                section.appendChild(table);
                container.appendChild(section);
            });
        }

        groupByGestionnaire(surveyData, analyzer) {
            const grouped = {};
            
            Object.entries(surveyData).forEach(([name, data]) => {
                const gestionnaire = Object.keys(data.gestionnaire)[0] || 'Autres ou vides';
                if (!grouped[gestionnaire]) {
                    grouped[gestionnaire] = [];
                }
                
                grouped[gestionnaire].push({
                    name,
                    data,
                    satisfaction: analyzer.calculateSatisfactionPercentage(data.satisfaction),
                    totalReponses: data.totalReponses
                });
            });
            
            // Trier les gestionnaires dans l'ordre souhaité
            const orderedGestionnaires = [
                'Ville de Strasbourg',
                'AASBR [AASBR]',
                'AGES',
                'AGF', 
                'ALEF',
                'Fondation d\'Auteuil',
                'Fossé des treize',
                'APEDI',
                'Autres ou vides'
            ];
            
            const orderedGrouped = {};
            orderedGestionnaires.forEach(gestionnaire => {
                if (grouped[gestionnaire]) {
                    orderedGrouped[gestionnaire] = grouped[gestionnaire];
                }
            });
            
            return orderedGrouped;
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
                .slice(0, 2) // Top 2 CSP
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

        sortBySatisfaction(surveyData, analyzer) {
            return Object.entries(surveyData)
                .map(([name, data]) => ({
                    name,
                    data,
                    satisfaction: analyzer.calculateSatisfactionPercentage(data.satisfaction),
                    gestionnaire: Object.keys(data.gestionnaire)[0] || 'Non spécifié',
                    totalReponses: data.totalReponses
                }))
                .sort((a, b) => b.satisfaction - a.satisfaction);
        }

        sortByGestionnaire(surveyData, analyzer) {
            const gestionnaireOrder = [
                'Ville de Strasbourg',
                'AASBR [AASBR]',
                'AGES', 
                'AGF',
                'ALEF',
                'Fondation d\'Auteuil',
                'Fossé des treize',
                'APEDI'
            ];
            
            return Object.entries(surveyData)
                .map(([name, data]) => ({
                    name,
                    data,
                    satisfaction: analyzer.calculateSatisfactionPercentage(data.satisfaction),
                    gestionnaire: Object.keys(data.gestionnaire)[0] || 'Autres ou vides',
                    totalReponses: data.totalReponses
                }))
                .sort((a, b) => {
                    const indexA = gestionnaireOrder.indexOf(a.gestionnaire);
                    const indexB = gestionnaireOrder.indexOf(b.gestionnaire);
                    
                    // Si les deux gestionnaires sont dans la liste
                    if (indexA !== -1 && indexB !== -1) {
                        return indexA - indexB;
                    }
                    // Si seul A est dans la liste
                    if (indexA !== -1) return -1;
                    // Si seul B est dans la liste  
                    if (indexB !== -1) return 1;
                    // Si aucun n'est dans la liste, trier par nom
                    return a.gestionnaire.localeCompare(b.gestionnaire);
                });
        }

        sortByRepondants(surveyData, analyzer) {
            return Object.entries(surveyData)
                .map(([name, data]) => ({
                    name,
                    data,
                    satisfaction: analyzer.calculateSatisfactionPercentage(data.satisfaction),
                    gestionnaire: Object.keys(data.gestionnaire)[0] || 'Non spécifié',
                    totalReponses: data.totalReponses
                }))
                .sort((a, b) => b.totalReponses - a.totalReponses);
        }

        sortByEtablissement(surveyData, analyzer) {
            return Object.entries(surveyData)
                .map(([name, data]) => ({
                    name,
                    data,
                    satisfaction: analyzer.calculateSatisfactionPercentage(data.satisfaction),
                    gestionnaire: Object.keys(data.gestionnaire)[0] || 'Non spécifié',
                    totalReponses: data.totalReponses
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
        }

        renderSortedEtablissements(container, sortedData, sectionTitle, viewType) {
            container.innerHTML = '';
            container.className = 'etablissements-grid'; // Reset to default class
            
            // Titre de section
            const titleElement = document.createElement('div');
            titleElement.className = 'section-title';
            titleElement.innerHTML = `<h3>${sectionTitle}</h3>`;
            container.appendChild(titleElement);
            
            // Regroupement par gestionnaire pour la vue gestionnaires
            if (viewType === 'gestionnaires') {
                this.renderByGestionnaire(container, sortedData);
            } else {
                this.renderSimpleList(container, sortedData, viewType);
            }
        }

        renderByGestionnaire(container, sortedData) {
            const groupedByGestionnaire = {};
            
            sortedData.forEach(item => {
                const gestionnaire = item.gestionnaire;
                if (!groupedByGestionnaire[gestionnaire]) {
                    groupedByGestionnaire[gestionnaire] = [];
                }
                groupedByGestionnaire[gestionnaire].push(item);
            });
            
            Object.entries(groupedByGestionnaire).forEach(([gestionnaire, etablissements]) => {
                // En-tête de gestionnaire
                const gestionnaireHeader = document.createElement('div');
                gestionnaireHeader.className = 'gestionnaire-header';
                
                // Calculer les stats du gestionnaire
                const totalEtab = etablissements.length;
                const totalReponses = etablissements.reduce((sum, etab) => sum + etab.totalReponses, 0);
                const avgSatisfaction = Math.round(
                    etablissements.reduce((sum, etab) => sum + etab.satisfaction, 0) / totalEtab
                );
                
                gestionnaireHeader.innerHTML = `
                    <div class="gestionnaire-title ${this.getGestionnaireClass(gestionnaire)}">
                        <h4>👥 ${gestionnaire}</h4>
                        <div class="gestionnaire-stats">
                            <span class="stat-badge">${totalEtab} établissement${totalEtab > 1 ? 's' : ''}</span>
                            <span class="stat-badge">${totalReponses} réponses</span>
                            <span class="stat-badge satisfaction">${avgSatisfaction}% satisfaction</span>
                        </div>
                    </div>
                `;
                container.appendChild(gestionnaireHeader);
                
                // Grille des établissements pour ce gestionnaire
                const gestionnaireGrid = document.createElement('div');
                gestionnaireGrid.className = 'gestionnaire-grid';
                
                etablissements.forEach(item => {
                    const card = this.createEtablissementCard(item);
                    gestionnaireGrid.appendChild(card);
                });
                
                container.appendChild(gestionnaireGrid);
            });
        }

        renderSimpleList(container, sortedData, viewType) {
            const grid = document.createElement('div');
            grid.className = 'etablissements-simple-grid';
            
            sortedData.forEach((item, index) => {
                const showRank = viewType === 'satisfaction' || viewType === 'repondants';
                const card = this.createEtablissementCard(item, showRank ? index + 1 : null);
                grid.appendChild(card);
            });
            
            container.appendChild(grid);
        }

        createEtablissementCard(item, rank = null) {
            const { name, data, satisfaction, gestionnaire, totalReponses } = item;
            const gestClass = this.getGestionnaireClass(gestionnaire);
            
            const card = document.createElement('div');
            card.className = 'etablissement-card';
            
            let rankBadge = '';
            if (rank !== null) {
                let rankClass = '';
                let rankIcon = '';
                if (rank <= 3) {
                    rankClass = 'rank-top';
                    rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';
                } else if (rank <= 10) {
                    rankClass = 'rank-good';
                    rankIcon = '⭐';
                } else {
                    rankClass = 'rank-normal';
                    rankIcon = '#';
                }
                
                rankBadge = `<div class="rank-badge ${rankClass}">${rankIcon}${rank}</div>`;
            }
            
            card.innerHTML = `
                ${rankBadge}
                <div class="card-header ${gestClass}">
                    <h3>${name}</h3>
                    <span class="gestionnaire-badge">${gestionnaire}</span>
                </div>
                <div class="card-content">
                    <div class="metric">
                        <div class="metric-label">📊 Satisfaction globale</div>
                        <div class="metric-value">${satisfaction}%</div>
                        <div class="satisfaction-bar">
                            <div class="satisfaction-fill" style="width: ${satisfaction}%"></div>
                        </div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">📋 Nombre de réponses</div>
                        <div class="metric-value">${totalReponses}</div>
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
            
            return card;
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

            // NOUVEAUX ÉLÉMENTS : Fichier de mapping
            const mappingInput = document.getElementById('mapping-input');
            const selectMappingBtn = document.getElementById('select-mapping-btn');
            const mappingUploadArea = document.getElementById('mapping-upload-area');
            const downloadTemplateBtn = document.getElementById('download-template-btn');

            if (selectFileBtn) selectFileBtn.addEventListener('click', () => fileInput.click());
            if (fileInput) fileInput.addEventListener('change', e => this.handleFileSelect(e.target.files[0]));
            if (uploadArea) {
                uploadArea.addEventListener('dragover', e => this.handleDragOver(e));
                uploadArea.addEventListener('dragleave', e => this.handleDragLeave(e));
                uploadArea.addEventListener('drop', e => this.handleDrop(e));
            }

            // NOUVEAUX EVENT LISTENERS : Mapping gestionnaires
            if (selectMappingBtn) selectMappingBtn.addEventListener('click', () => mappingInput.click());
            if (mappingInput) mappingInput.addEventListener('change', e => this.handleMappingFileSelect(e.target.files[0]));
            if (downloadTemplateBtn) downloadTemplateBtn.addEventListener('click', () => this.downloadMappingTemplate());
            if (mappingUploadArea) {
                mappingUploadArea.addEventListener('dragover', e => this.handleMappingDragOver(e));
                mappingUploadArea.addEventListener('dragleave', e => this.handleMappingDragLeave(e));
                mappingUploadArea.addEventListener('drop', e => this.handleMappingDrop(e));
            }

            if (processFileBtn) processFileBtn.addEventListener('click', () => this.processFile());
            if (newFileBtn) newFileBtn.addEventListener('click', () => this.resetToUpload());
            if (retryBtn) retryBtn.addEventListener('click', () => this.resetToUpload());
            if (exportBtn) exportBtn.addEventListener('click', () => this.exportResults());
            if (closeModal) closeModal.addEventListener('click', () => this.closeModal());
            if (exportPdfBtn) exportPdfBtn.addEventListener('click', () => this.exportCurrentEtablissementToPDF());
            
            // Gestionnaire pour les onglets de vue
            document.addEventListener('click', (e) => {
                if (e.target.classList.contains('tab-btn')) {
                    this.switchView(e.target.dataset.view);
                }
            });
            
            window.addEventListener('click', e => {
                if (e.target === modal) this.closeModal();
            });
        }

        // NOUVELLES MÉTHODES : Gestion du fichier de mapping
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
                
                // Afficher un aperçu du mapping dans la console pour vérification
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

        // MÉTHODE : Télécharger un template de fichier de mapping
        downloadMappingTemplate() {
            // Créer un fichier CSV template avec les gestionnaires standards
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

            // Convertir en CSV
            const csvContent = templateData
                .map(row => row.map(cell => `"${cell}"`).join(','))
                .join('\n');

            // Créer et télécharger le fichier
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

        switchView(viewType) {
            // Mettre à jour les onglets actifs
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector(`[data-view="${viewType}"]`).classList.add('active');
            
            // Réorganiser l'affichage selon la vue
            const surveyData = this.dataAnalyzer.getSurveyData();
            this.uiRenderer.renderEtablissementsByView(surveyData, this.dataAnalyzer, viewType);
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
            document.getElementById('mapping-input').value = '';
            this.uiRenderer.hideFileInfo();
            this.hideMappingInfo();
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