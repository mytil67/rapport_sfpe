// global-stats.js - Version corrigée avec graphiques optimisés et tableaux pour questions ouvertes
// Correction des problèmes d'affichage des CSP et amélioration des questions ouvertes

(function() {
    'use strict';

    // ===== GlobalStatsManager Class =====
    class GlobalStatsManager {
        constructor() {
            this.globalData = null;
            this.charts = new Map();
            this.satisfactionCalculator = new SatisfactionCalculator();
            this.chartJsReady = false;
            
            // Vérifier Chart.js
            this.checkChartJs();
            
            // Couleurs cohérentes avec l'application
            this.colors = {
                primary: ['#4facfe', '#00f2fe'],
                secondary: ['#f093fb', '#f5576c'],
                satisfaction: {
                    'Très satisfait': '#43e97b',
                    'Plutôt satisfait': '#4facfe', 
                    'Peu satisfait': '#fa709a',
                    'Pas satisfait': '#ff6b6b'
                },
                gestionnaires: {
                    'Ville de Strasbourg': '#4facfe',
                    'ALEF': '#43e97b',
                    'AGES': '#fa709a',
                    'AGF': '#a8edea',
                    'Fondation d\'Auteuil': '#ffbdb3',
                    'APEDI': '#667eea',
                    'AASBR [AASBR]': '#764ba2',
                    'Fossé des treize': '#667eea'
                },
                chartPalette: [
                    '#4facfe', '#43e97b', '#fa709a', '#ff6b6b', '#ffc107',
                    '#17a2b8', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c'
                ]
            };
            
            console.log('🌍 GlobalStatsManager initialisé');
        }

        // ===== VÉRIFICATION CHART.JS =====
        checkChartJs() {
            if (typeof Chart !== 'undefined') {
                this.chartJsReady = true;
                console.log('✅ Chart.js disponible');
                return Promise.resolve(true);
            }

            console.warn('⚠️ Chart.js non disponible, tentative de chargement...');
            return this.loadChartJs();
        }

        loadChartJs() {
            return new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js';
                script.onload = () => {
                    this.chartJsReady = true;
                    console.log('✅ Chart.js chargé dynamiquement');
                    resolve(true);
                };
                script.onerror = () => {
                    console.error('❌ Impossible de charger Chart.js');
                    this.chartJsReady = false;
                    resolve(false);
                };
                document.head.appendChild(script);
            });
        }

        // ===== MÉTHODE PRINCIPALE : Analyser toutes les données =====
        analyzeGlobalData(surveyData, rawData) {
            console.log('🔍 === ANALYSE GLOBALE DÉMARRÉE ===');
            console.log(`📊 Données reçues: ${Object.keys(surveyData).length} établissements, ${rawData.length} réponses`);

            this.globalData = {
                metadata: {
                    totalEtablissements: Object.keys(surveyData).length,
                    totalReponses: rawData.length,
                    dateAnalyse: new Date().toISOString(),
                    periodeEnquete: this.calculateSurveyPeriod(rawData)
                },
                demographics: this.analyzeGlobalDemographics(surveyData, rawData),
                satisfaction: this.analyzeGlobalSatisfaction(surveyData),
                gestionnaires: this.analyzeByGestionnaire(surveyData),
                questions: this.analyzeGlobalQuestions(surveyData),
                comparative: this.generateComparativeAnalysis(surveyData)
            };

            console.log('✅ Analyse globale terminée');
            console.log('📋 Questions analysées:', Object.keys(this.globalData.questions).length);
            return this.globalData;
        }

        // ===== ANALYSE DÉMOGRAPHIQUE GLOBALE =====
        analyzeGlobalDemographics(surveyData, rawData) {
            console.log('👥 Analyse démographique globale...');
            
            const demographics = {
                genre: {},
                age: {},
                csp: {},
                cspOptimized: {}, // NOUVEAU: Version optimisée pour graphiques
                repartitionEtablissements: {}
            };

            // Agrégation des genres
            Object.values(surveyData).forEach(data => {
                Object.entries(data.genre).forEach(([genre, count]) => {
                    if (genre !== 'Non spécifié') {
                        demographics.genre[genre] = (demographics.genre[genre] || 0) + count;
                    }
                });
            });

            // Agrégation des CSP depuis les données brutes pour plus de précision
            rawData.forEach(response => {
                if (response.csp && response.csp !== 'Non spécifié') {
                    demographics.csp[response.csp] = (demographics.csp[response.csp] || 0) + 1;
                }
                if (response.age && response.age !== 'Non spécifié') {
                    demographics.age[response.age] = (demographics.age[response.age] || 0) + 1;
                }
            });

            // NOUVEAU: Optimisation des CSP pour l'affichage graphique
            demographics.cspOptimized = this.optimizeCSPForChart(demographics.csp);

            // Répartition par gestionnaire
            Object.values(surveyData).forEach(data => {
                Object.entries(data.gestionnaire).forEach(([gestionnaire, count]) => {
                    demographics.repartitionEtablissements[gestionnaire] = 
                        (demographics.repartitionEtablissements[gestionnaire] || 0) + 1;
                });
            });

            console.log('✅ Démographie globale analysée');
            return demographics;
        }

        // NOUVELLE MÉTHODE: Optimiser les CSP pour l'affichage
        optimizeCSPForChart(cspData) {
            const sortedCSP = Object.entries(cspData)
                .sort((a, b) => b[1] - a[1]);

            // Garder les 6 principales CSP
            const topCSP = sortedCSP.slice(0, 6);
            const othersCount = sortedCSP.slice(6).reduce((sum, [, count]) => sum + count, 0);

            const optimized = {};
            topCSP.forEach(([csp, count]) => {
                // Raccourcir les noms trop longs
                let shortName = csp;
                if (csp.length > 25) {
                    shortName = csp.substring(0, 22) + '...';
                }
                optimized[shortName] = count;
            });

            if (othersCount > 0) {
                optimized['Autres CSP'] = othersCount;
            }

            return optimized;
        }

        // ===== ANALYSE SATISFACTION GLOBALE =====
        analyzeGlobalSatisfaction(surveyData) {
            console.log('😊 Analyse satisfaction globale...');
            
            const globalSatisfaction = {};
            const satisfactionByGestionnaire = {};
            const detailedStats = {
                total: 0,
                details: {},
                byMethod: {}
            };

            // Agrégation des données de satisfaction
            Object.entries(surveyData).forEach(([etablissement, data]) => {
                const gestionnaire = Object.keys(data.gestionnaire)[0];
                
                // Satisfaction globale
                Object.entries(data.satisfaction).forEach(([level, count]) => {
                    globalSatisfaction[level] = (globalSatisfaction[level] || 0) + count;
                });

                // Par gestionnaire
                if (!satisfactionByGestionnaire[gestionnaire]) {
                    satisfactionByGestionnaire[gestionnaire] = {};
                }
                Object.entries(data.satisfaction).forEach(([level, count]) => {
                    satisfactionByGestionnaire[gestionnaire][level] = 
                        (satisfactionByGestionnaire[gestionnaire][level] || 0) + count;
                });
            });

            // Calculs avec le nouveau système
            const globalResults = this.satisfactionCalculator.calculateSatisfactionMultiple(globalSatisfaction);
            if (globalResults) {
                detailedStats.byMethod = {
                    strict: globalResults.strict,
                    weighted: globalResults.weighted,
                    adjusted: globalResults.adjusted,
                    trend: globalResults.trend
                };
                detailedStats.metrics = globalResults.metrics;
            }

            console.log('✅ Satisfaction globale analysée');
            return {
                global: globalSatisfaction,
                byGestionnaire: satisfactionByGestionnaire,
                stats: detailedStats
            };
        }

        // ===== ANALYSE PAR GESTIONNAIRE =====
        analyzeByGestionnaire(surveyData) {
            console.log('🏢 Analyse par gestionnaire...');
            
            const gestionnaireStats = {};

            Object.entries(surveyData).forEach(([etablissement, data]) => {
                const gestionnaire = Object.keys(data.gestionnaire)[0];
                
                if (!gestionnaireStats[gestionnaire]) {
                    gestionnaireStats[gestionnaire] = {
                        etablissements: [],
                        totalReponses: 0,
                        satisfaction: {},
                        demographics: { genre: {}, csp: {} }
                    };
                }

                gestionnaireStats[gestionnaire].etablissements.push(etablissement);
                gestionnaireStats[gestionnaire].totalReponses += data.totalReponses;

                // Agrégation satisfaction
                Object.entries(data.satisfaction).forEach(([level, count]) => {
                    gestionnaireStats[gestionnaire].satisfaction[level] = 
                        (gestionnaireStats[gestionnaire].satisfaction[level] || 0) + count;
                });

                // Agrégation démographie
                Object.entries(data.genre).forEach(([genre, count]) => {
                    if (genre !== 'Non spécifié') {
                        gestionnaireStats[gestionnaire].demographics.genre[genre] = 
                            (gestionnaireStats[gestionnaire].demographics.genre[genre] || 0) + count;
                    }
                });

                Object.entries(data.csp).forEach(([csp, count]) => {
                    if (csp !== 'Non spécifié') {
                        gestionnaireStats[gestionnaire].demographics.csp[csp] = 
                            (gestionnaireStats[gestionnaire].demographics.csp[csp] || 0) + count;
                    }
                });
            });

            // Calcul des pourcentages de satisfaction pour chaque gestionnaire
            Object.entries(gestionnaireStats).forEach(([gestionnaire, stats]) => {
                const results = this.satisfactionCalculator.calculateSatisfactionMultiple(stats.satisfaction);
                if (results) {
                    stats.satisfactionScore = results.weighted;
                    stats.satisfactionMethods = {
                        strict: results.strict,
                        weighted: results.weighted,
                        adjusted: results.adjusted,
                        trend: results.trend
                    };
                }
            });

            console.log('✅ Analyse par gestionnaire terminée');
            return gestionnaireStats;
        }

        // ===== ANALYSE GLOBALE DES QUESTIONS =====
        analyzeGlobalQuestions(surveyData) {
            console.log('❓ Analyse globale des questions...');
            
            const globalQuestions = {};
            const questionOrder = new Map();

            // Collecter toutes les questions uniques
            Object.values(surveyData).forEach(data => {
                Object.entries(data.questionStats).forEach(([questionKey, qData]) => {
                    if (!globalQuestions[questionKey]) {
                        globalQuestions[questionKey] = {
                            question: qData.question,
                            originalHeader: qData.originalHeader,
                            columnIndex: qData.columnIndex,
                            answers: {},
                            totalResponses: 0,
                            responsesList: [],
                            isOpenQuestion: qData.isOpenQuestion,
                            isMultiOptions: qData.isMultiOptions,
                            establishmentCount: 0,
                            byGestionnaire: {}
                        };
                        questionOrder.set(questionKey, qData.columnIndex || 999);
                    }

                    const gq = globalQuestions[questionKey];
                    gq.establishmentCount++;
                    gq.totalResponses += qData.totalResponses;

                    // Obtenir le gestionnaire de cet établissement
                    const gestionnaire = Object.keys(data.gestionnaire)[0] || 'Non spécifié';
                    if (!gq.byGestionnaire[gestionnaire]) {
                        gq.byGestionnaire[gestionnaire] = {
                            answers: {},
                            totalResponses: 0,
                            responsesList: []
                        };
                    }

                    // Agrégation des réponses
                    if (qData.answers) {
                        Object.entries(qData.answers).forEach(([answer, count]) => {
                            gq.answers[answer] = (gq.answers[answer] || 0) + count;
                            gq.byGestionnaire[gestionnaire].answers[answer] = 
                                (gq.byGestionnaire[gestionnaire].answers[answer] || 0) + count;
                        });
                    }

                    // Agrégation des réponses ouvertes
                    if (qData.responsesList) {
                        gq.responsesList.push(...qData.responsesList.map(resp => ({
                            ...resp,
                            gestionnaire: gestionnaire
                        })));
                        gq.byGestionnaire[gestionnaire].responsesList.push(...qData.responsesList);
                    }

                    gq.byGestionnaire[gestionnaire].totalResponses += qData.totalResponses;
                });
            });

            // Trier les questions par ordre de colonne
            const sortedQuestions = {};
            Array.from(questionOrder.entries())
                .sort((a, b) => a[1] - b[1])
                .forEach(([questionKey]) => {
                    sortedQuestions[questionKey] = globalQuestions[questionKey];
                });

            console.log(`✅ ${Object.keys(sortedQuestions).length} questions analysées globalement`);
            return sortedQuestions;
        }

        // ===== ANALYSE COMPARATIVE =====
        generateComparativeAnalysis(surveyData) {
            console.log('📊 Génération analyse comparative...');
            
            const comparative = {
                topSatisfaction: [],
                lowSatisfaction: [],
                mostResponses: [],
                bySize: { small: [], medium: [], large: [] },
                outliers: []
            };

            const etablissementStats = Object.entries(surveyData).map(([name, data]) => {
                const gestionnaire = Object.keys(data.gestionnaire)[0];
                const satisfaction = this.satisfactionCalculator.calculateSatisfactionMultiple(data.satisfaction);
                
                return {
                    name,
                    gestionnaire,
                    satisfaction: satisfaction ? satisfaction.weighted : 0,
                    totalReponses: data.totalReponses,
                    satisfactionMethods: satisfaction ? {
                        strict: satisfaction.strict,
                        weighted: satisfaction.weighted,
                        adjusted: satisfaction.adjusted,
                        trend: satisfaction.trend
                    } : null
                };
            });

            // Top et low satisfaction
            comparative.topSatisfaction = etablissementStats
                .sort((a, b) => b.satisfaction - a.satisfaction)
                .slice(0, 5);

            comparative.lowSatisfaction = etablissementStats
                .sort((a, b) => a.satisfaction - b.satisfaction)
                .slice(0, 5);

            // Plus de réponses
            comparative.mostResponses = etablissementStats
                .sort((a, b) => b.totalReponses - a.totalReponses)
                .slice(0, 5);

            // Classification par taille
            etablissementStats.forEach(etab => {
                if (etab.totalReponses <= 10) comparative.bySize.small.push(etab);
                else if (etab.totalReponses <= 25) comparative.bySize.medium.push(etab);
                else comparative.bySize.large.push(etab);
            });

            console.log('✅ Analyse comparative générée');
            return comparative;
        }

        // ===== RENDU INTERFACE =====
        async renderGlobalStats(container) {
            if (!this.globalData) {
                container.innerHTML = '<p>Aucune donnée globale disponible. Veuillez d\'abord analyser des données.</p>';
                return;
            }

            console.log('🎨 Rendu des statistiques globales...');

            container.innerHTML = `
                <div class="global-stats-container">
                    <!-- En-tête avec métriques clés -->
                    <div class="global-overview">
                        <h2>🌍 Vue d'ensemble globale</h2>
                        <div class="overview-metrics">
                            <div class="metric-card primary">
                                <div class="metric-number">${this.globalData.metadata.totalEtablissements}</div>
                                <div class="metric-label">Établissements</div>
                            </div>
                            <div class="metric-card secondary">
                                <div class="metric-number">${this.globalData.metadata.totalReponses}</div>
                                <div class="metric-label">Réponses totales</div>
                            </div>
                            <div class="metric-card satisfaction">
                                <div class="metric-number">${this.globalData.satisfaction.stats.byMethod.weighted || 0}%</div>
                                <div class="metric-label">Satisfaction globale</div>
                            </div>
                            <div class="metric-card info">
                                <div class="metric-number">${Object.keys(this.globalData.gestionnaires).length}</div>
                                <div class="metric-label">Gestionnaires</div>
                            </div>
                        </div>
                    </div>

                    <!-- Section graphiques démographiques -->
                    <div class="demographics-section">
                        <h3>👥 Démographie globale</h3>
                        <div class="charts-grid">
                            <div class="chart-container">
                                <h4>Répartition par genre</h4>
                                <canvas id="genreChart" width="300" height="200"></canvas>
                            </div>
                            <div class="chart-container">
                                <h4>Principales catégories socio-professionnelles</h4>
                                <canvas id="cspChart" width="300" height="200"></canvas>
                            </div>
                            <div class="chart-container">
                                <h4>Répartition par gestionnaire</h4>
                                <canvas id="gestionnaireChart" width="300" height="200"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- Section satisfaction -->
                    <div class="satisfaction-section">
                        <h3>😊 Analyse de la satisfaction</h3>
                        <div class="satisfaction-overview">
                            <div class="satisfaction-methods">
                                <h4>Méthodes de calcul</h4>
                                <div class="methods-grid">
                                    <div class="method-result">
                                        <span class="method-name">Stricte</span>
                                        <span class="method-value">${this.globalData.satisfaction.stats.byMethod.strict || 0}%</span>
                                    </div>
                                    <div class="method-result active">
                                        <span class="method-name">Pondérée (active)</span>
                                        <span class="method-value">${this.globalData.satisfaction.stats.byMethod.weighted || 0}%</span>
                                    </div>
                                    <div class="method-result">
                                        <span class="method-name">Ajustée</span>
                                        <span class="method-value">${this.globalData.satisfaction.stats.byMethod.adjusted || 0}%</span>
                                    </div>
                                    <div class="method-result">
                                        <span class="method-name">Tendance</span>
                                        <span class="method-value">${this.globalData.satisfaction.stats.byMethod.trend || 0}%</span>
                                    </div>
                                </div>
                            </div>
                            <div class="chart-container">
                                <h4>Distribution globale</h4>
                                <canvas id="satisfactionChart" width="400" height="250"></canvas>
                            </div>
                        </div>
                        
                        <!-- Satisfaction par gestionnaire avec hauteur contrôlée -->
                        <div class="satisfaction-by-manager chart-container large">
                            <h4>Satisfaction par gestionnaire</h4>
                            <div style="height: 350px; position: relative;">
                                <canvas id="satisfactionByManagerChart" width="600" height="300"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- Section questions -->
                    <div class="questions-section">
                        <h3>❓ Analyse question par question</h3>
                        <div class="questions-controls">
                            <button id="toggleAllQuestions" class="control-btn">Tout développer</button>
                            <button id="exportGlobalPDF" class="control-btn primary">📄 Exporter le rapport global</button>
                        </div>
                        <div id="questionsContainer" class="questions-container">
                            ${this.renderQuestionsList()}
                        </div>
                    </div>

                    <!-- Section comparative -->
                    <div class="comparative-section">
                        <h3>📊 Analyse comparative</h3>
                        <div class="comparative-grid">
                            <div class="comparative-item">
                                <h4>🏆 Top satisfaction</h4>
                                <div class="ranking-list">
                                    ${this.renderRankingList(this.globalData.comparative.topSatisfaction, 'satisfaction')}
                                </div>
                            </div>
                            <div class="comparative-item">
                                <h4>📈 Plus de répondants</h4>
                                <div class="ranking-list">
                                    ${this.renderRankingList(this.globalData.comparative.mostResponses, 'totalReponses')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Vérifier Chart.js avant de générer les graphiques
            if (!this.chartJsReady) {
                console.log('📊 Chargement de Chart.js...');
                const loaded = await this.checkChartJs();
                if (!loaded) {
                    console.warn('⚠️ Chart.js non disponible, graphiques désactivés');
                }
            }

            // Générer les graphiques avec délai
            setTimeout(async () => {
                await this.generateCharts();
                this.setupGlobalStatsEvents();
                this.forceCanvasDimensions(); // Appel correct à la méthode
            }, 200);

            console.log('✅ Interface des statistiques globales rendue avec hauteurs contrôlées');
        }

        // NOUVELLE MÉTHODE: Forcer les dimensions des canvas
        forceCanvasDimensions() {
            const canvases = document.querySelectorAll('canvas');
            canvases.forEach(canvas => {
                if (canvas.id === 'satisfactionByManagerChart') {
                    canvas.style.maxHeight = '350px';
                    canvas.style.height = '350px';
                    canvas.style.width = '100%';
                } else if (canvas.closest('.chart-container')) {
                    canvas.style.maxHeight = '250px';
                    canvas.style.width = '100%';
                }
            });
        }

        // ===== RENDU DES QUESTIONS =====
        renderQuestionsList() {
            let html = '';
            
            Object.entries(this.globalData.questions).forEach(([questionKey, qData]) => {
                const questionId = `question-${questionKey.replace(/[^a-zA-Z0-9]/g, '-')}`;
                
                html += `
                    <div class="question-item" data-question-key="${questionKey}">
                        <div class="question-header" onclick="toggleQuestion('${questionId}')">
                            <h4>${qData.question}</h4>
                            <div class="question-meta">
                                <span class="responses-count">${qData.totalResponses} réponses</span>
                                <span class="establishments-count">${qData.establishmentCount} établissements</span>
                                <span class="toggle-icon">▼</span>
                            </div>
                        </div>
                        <div id="${questionId}" class="question-details" style="display: none;">
                            ${this.renderQuestionDetails(qData)}
                        </div>
                    </div>
                `;
            });

            return html;
        }

        // MÉTHODE MODIFIÉE: Rendu des détails avec tableaux pour questions ouvertes
        renderQuestionDetails(qData) {
            let html = '';

            if (qData.isOpenQuestion) {
                // NOUVEAU: Question ouverte - tableau structuré
                html += this.renderOpenQuestionTable(qData);
            } else {
                // Question fermée - graphique + tableau
                const chartId = `chart-${qData.question.replace(/[^a-zA-Z0-9]/g, '-')}`;
                
                html += `
                    <div class="closed-question-details">
                        <div class="question-chart">
                            ${this.chartJsReady ? 
                                `<canvas id="${chartId}" width="500" height="300"></canvas>` :
                                `<div class="chart-placeholder">📊 Graphique non disponible (Chart.js requis)</div>`
                            }
                        </div>
                        <div class="question-table">
                            <table class="question-results-table">
                                <thead>
                                    <tr>
                                        <th>Réponse</th>
                                        <th>Total</th>
                                        <th>Pourcentage</th>
                                        ${Object.keys(qData.byGestionnaire).map(g => 
                                            `<th>${g}</th>`
                                        ).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${Object.entries(qData.answers)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([answer, count]) => {
                                            const percentage = Math.round((count / qData.totalResponses) * 100);
                                            return `
                                                <tr>
                                                    <td class="answer-cell">${answer}</td>
                                                    <td class="count-cell">${count}</td>
                                                    <td class="percentage-cell">${percentage}%</td>
                                                    ${Object.entries(qData.byGestionnaire).map(([gestionnaire, gData]) => {
                                                        const gCount = gData.answers[answer] || 0;
                                                        const gPercentage = gData.totalResponses > 0 ? 
                                                            Math.round((gCount / gData.totalResponses) * 100) : 0;
                                                        return `<td class="gestionnaire-cell">${gCount} (${gPercentage}%)</td>`;
                                                    }).join('')}
                                                </tr>
                                            `;
                                        }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;

                // Programmer la création du graphique
                if (this.chartJsReady) {
                    setTimeout(() => {
                        this.createQuestionChart(chartId, qData);
                    }, 100);
                }
            }

            return html;
        }

        // NOUVELLE MÉTHODE: Rendu tableau pour questions ouvertes
        renderOpenQuestionTable(qData) {
            const gestionnaires = Object.keys(qData.byGestionnaire);
            
            return `
                <div class="open-question-details">
                    <div class="responses-summary">
                        <p><strong>${qData.responsesList.length}</strong> réponses textuelles collectées</p>
                        <div class="response-filter">
                            <label>Filtrer par gestionnaire:</label>
                            <select onchange="filterOpenResponsesTable('${qData.question}', this.value)">
                                <option value="">Tous (${qData.responsesList.length} réponses)</option>
                                ${gestionnaires.map(g => 
                                    `<option value="${g}">${g} (${qData.byGestionnaire[g].responsesList.length} réponses)</option>`
                                ).join('')}
                            </select>
                        </div>
                    </div>
                    
                    <div class="open-responses-table-container">
                        <table class="open-responses-table">
                            <thead>
                                <tr>
                                    <th style="width: 40px;">#</th>
                                    <th style="width: 50%;">Réponse</th>
                                    <th style="width: 20%;">Gestionnaire</th>
                                    <th style="width: 20%;">Profil</th>
                                </tr>
                            </thead>
                            <tbody id="openResponsesTableBody-${qData.question.replace(/[^a-zA-Z0-9]/g, '-')}">
                                ${qData.responsesList.map((resp, idx) => `
                                    <tr class="open-response-row" data-gestionnaire="${resp.gestionnaire}">
                                        <td class="response-number">${idx + 1}</td>
                                        <td class="response-content">"${resp.answer}"</td>
                                        <td class="response-etablissement">${resp.gestionnaire}</td>
                                        <td class="profile-info">
                                            <div class="genre">${resp.genre}</div>
                                            <div class="csp">${resp.csp}</div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="open-question-summary">
                        <h5>📊 Résumé par gestionnaire</h5>
                        <div class="summary-stats">
                            ${gestionnaires.map(g => {
                                const gData = qData.byGestionnaire[g];
                                const percentage = Math.round((gData.responsesList.length / qData.responsesList.length) * 100);
                                return `
                                    <div class="stat-item">
                                        <span class="stat-label">${g}</span>
                                        <span class="stat-value">${gData.responsesList.length} réponses (${percentage}%)</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        }

        renderRankingList(items, field) {
            return items.map((item, index) => `
                <div class="ranking-item">
                    <span class="rank">#${index + 1}</span>
                    <span class="name">${item.name}</span>
                    <span class="value">${field === 'satisfaction' ? item[field] + '%' : item[field]}</span>
                    <span class="gestionnaire">${item.gestionnaire}</span>
                </div>
            `).join('');
        }

        // ===== GÉNÉRATION DES GRAPHIQUES OPTIMISÉS =====
        async generateCharts() {
            console.log('📊 Génération des graphiques optimisés...');

            if (!this.chartJsReady) {
                console.warn('⚠️ Chart.js non disponible');
                this.displayChartsUnavailableMessage();
                return;
            }

            try {
                // Graphique genre (pie)
                this.createPieChart('genreChart', 
                    Object.entries(this.globalData.demographics.genre),
                    'Répartition par genre',
                    ['#4facfe', '#f093fb', '#43e97b']
                );

                // NOUVEAU: Graphique CSP optimisé (pie au lieu de bar)
                this.createPieChart('cspChart',
                    Object.entries(this.globalData.demographics.cspOptimized),
                    'Principales CSP',
                    this.colors.chartPalette
                );

                // Graphique gestionnaires (doughnut)
                this.createDoughnutChart('gestionnaireChart',
                    Object.entries(this.globalData.demographics.repartitionEtablissements),
                    'Établissements par gestionnaire'
                );

                // Graphique satisfaction globale (pie)
                this.createPieChart('satisfactionChart',
                    Object.entries(this.globalData.satisfaction.global)
                        .filter(([level]) => level !== 'Non spécifié'),
                    'Distribution de la satisfaction',
                    Object.values(this.colors.satisfaction)
                );

                // Graphique satisfaction par gestionnaire (bar)
                this.createSatisfactionByManagerChart();

                console.log('✅ Graphiques optimisés générés');
            } catch (error) {
                console.error('❌ Erreur lors de la génération des graphiques:', error);
                this.displayChartsErrorMessage();
            }
        }

        // MÉTHODES DE CRÉATION DE GRAPHIQUES
        createPieChart(canvasId, data, title, customColors = null) {
            if (!this.chartJsReady) return;

            const canvas = document.getElementById(canvasId);
            if (!canvas) {
                console.warn(`Canvas ${canvasId} introuvable`);
                return;
            }

            try {
                const ctx = canvas.getContext('2d');
                const colors = customColors || this.colors.chartPalette;

                const chart = new Chart(ctx, {
                    type: 'pie',
                    data: {
                        labels: data.map(item => item[0]),
                        datasets: [{
                            data: data.map(item => item[1]),
                            backgroundColor: colors.slice(0, data.length),
                            borderWidth: 2,
                            borderColor: '#ffffff'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        aspectRatio: 1.2,
                        plugins: {
                            title: {
                                display: true,
                                text: title,
                                font: { size: 14, weight: 'bold' }
                            },
                            legend: {
                                position: 'bottom',
                                labels: { 
                                    padding: 15, 
                                    usePointStyle: true,
                                    font: { size: 11 }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const percentage = Math.round((context.parsed / total) * 100);
                                        return `${context.label}: ${context.parsed} (${percentage}%)`;
                                    }
                                }
                            }
                        }
                    }
                });

                this.charts.set(canvasId, chart);
                console.log(`✅ Graphique pie créé: ${canvasId}`);
            } catch (error) {
                console.error(`❌ Erreur création graphique ${canvasId}:`, error);
            }
        }

        createDoughnutChart(canvasId, data, title) {
            if (!this.chartJsReady) return;

            const canvas = document.getElementById(canvasId);
            if (!canvas) return;

            try {
                const ctx = canvas.getContext('2d');
                const colors = Object.keys(this.colors.gestionnaires).map(g => 
                    this.colors.gestionnaires[g] || this.colors.chartPalette[0]
                );

                const chart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: data.map(item => item[0]),
                        datasets: [{
                            data: data.map(item => item[1]),
                            backgroundColor: colors.slice(0, data.length),
                            borderWidth: 3,
                            borderColor: '#ffffff'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        aspectRatio: 1.2,
                        plugins: {
                            title: {
                                display: true,
                                text: title,
                                font: { size: 14, weight: 'bold' }
                            },
                            legend: {
                                position: 'bottom',
                                labels: { 
                                    padding: 15, 
                                    usePointStyle: true,
                                    font: { size: 11 }
                                }
                            }
                        }
                    }
                });

                this.charts.set(canvasId, chart);
                console.log(`✅ Graphique doughnut créé: ${canvasId}`);
            } catch (error) {
                console.error(`❌ Erreur création graphique ${canvasId}:`, error);
            }
        }

        createSatisfactionByManagerChart() {
            if (!this.chartJsReady) {
                console.warn('⚠️ Chart.js non disponible pour le graphique satisfaction par gestionnaire');
                return;
            }

            const canvas = document.getElementById('satisfactionByManagerChart');
            if (!canvas) {
                console.warn('Canvas satisfactionByManagerChart introuvable');
                return;
            }

            try {
                console.log('📊 === CRÉATION GRAPHIQUE SATISFACTION PAR GESTIONNAIRE (HAUTEUR FIXE) ===');

                const ctx = canvas.getContext('2d');
                
                // Forcer les dimensions du canvas
                canvas.style.maxHeight = '350px';
                canvas.style.width = '100%';
                canvas.style.height = '350px';
                
                // Préparer et valider les données
                const validData = Object.entries(this.globalData.gestionnaires)
                    .map(([gestionnaire, stats]) => {
                        const satisfaction = typeof stats.satisfactionScore === 'number' ? stats.satisfactionScore : 0;
                        const reponses = typeof stats.totalReponses === 'number' ? stats.totalReponses : 0;
                        
                        return {
                            gestionnaire,
                            satisfaction,
                            reponses
                        };
                    })
                    .filter(item => item.reponses > 0)
                    .sort((a, b) => b.satisfaction - a.satisfaction);

                if (validData.length === 0) {
                    console.error('❌ Aucune donnée valide pour le graphique satisfaction par gestionnaire');
                    return;
                }

                // Limiter le nombre de gestionnaires affichés pour éviter un graphique trop long
                const maxGestionnaires = 8;
                const displayData = validData.slice(0, maxGestionnaires);
                
                if (validData.length > maxGestionnaires) {
                    console.log(`📊 Limitation à ${maxGestionnaires} gestionnaires (${validData.length} total)`);
                }

                console.log('📊 Données pour le graphique:', displayData);

                // Créer le graphique avec dimensions contrôlées
                const chart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: displayData.map(item => {
                            // Raccourcir les noms pour l'affichage
                            const name = item.gestionnaire;
                            if (name.length > 20) {
                                return name.substring(0, 17) + '...';
                            }
                            return name;
                        }),
                        datasets: [{
                            label: 'Satisfaction (%)',
                            data: displayData.map(item => item.satisfaction),
                            backgroundColor: displayData.map(item => 
                                this.colors.gestionnaires[item.gestionnaire] || '#4facfe'
                            ),
                            borderColor: displayData.map(item => 
                                this.colors.gestionnaires[item.gestionnaire] || '#4facfe'
                            ),
                            borderWidth: 1,
                            maxBarThickness: 60 // IMPORTANT: Limiter l'épaisseur des barres
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false, // IMPORTANT: Permet de contrôler la hauteur
                        aspectRatio: 1.5, // Ratio largeur/hauteur
                        layout: {
                            padding: {
                                top: 10,
                                bottom: 10,
                                left: 10,
                                right: 10
                            }
                        },
                        plugins: {
                            title: {
                                display: true,
                                text: 'Taux de satisfaction par gestionnaire',
                                font: { size: 14, weight: 'bold' },
                                padding: 20
                            },
                            legend: { 
                                display: false 
                            },
                            tooltip: {
                                callbacks: {
                                    title: function(context) {
                                        const data = displayData[context[0].dataIndex];
                                        return data.gestionnaire; // Nom complet dans le tooltip
                                    },
                                    label: function(context) {
                                        const data = displayData[context.dataIndex];
                                        return [
                                            `Satisfaction: ${data.satisfaction}%`,
                                            `Réponses: ${data.reponses}`
                                        ];
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100, // IMPORTANT: Fixer le maximum à 100%
                                min: 0,   // IMPORTANT: Fixer le minimum à 0%
                                title: {
                                    display: true,
                                    text: 'Satisfaction (%)',
                                    font: { size: 12, weight: 'bold' }
                                },
                                ticks: {
                                    stepSize: 10, // Graduations de 10 en 10
                                    callback: function(value) {
                                        return value + '%';
                                    },
                                    maxTicksLimit: 11 // Maximum 11 graduations (0 à 100 par 10)
                                },
                                grid: {
                                    display: true,
                                    drawBorder: true
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: 'Gestionnaires',
                                    font: { size: 12, weight: 'bold' }
                                },
                                ticks: {
                                    maxRotation: 45,
                                    minRotation: 0,
                                    font: { size: 10 }
                                },
                                grid: {
                                    display: false // Pas de grille verticale pour plus de clarté
                                }
                            }
                        },
                        elements: {
                            bar: {
                                borderWidth: 1,
                                borderRadius: 4 // Coins arrondis pour les barres
                            }
                        }
                    }
                });

                this.charts.set('satisfactionByManagerChart', chart);
                console.log('✅ Graphique satisfaction par gestionnaire créé avec hauteur contrôlée');
                console.log(`📊 ${displayData.length} gestionnaires affichés sur ${validData.length}`);
                
            } catch (error) {
                console.error('❌ Erreur création graphique satisfaction par gestionnaire:', error);
            }
        }

        async createQuestionChart(chartId, qData) {
            if (!this.chartJsReady) return;

            const canvas = document.getElementById(chartId);
            if (!canvas) return;

            try {
                const ctx = canvas.getContext('2d');
                const data = Object.entries(qData.answers).sort((a, b) => b[1] - a[1]);

                // Limiter à 10 réponses max pour éviter les graphiques trop longs
                const limitedData = data.slice(0, 10);

                const chart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: limitedData.map(item => {
                            // Raccourcir les labels trop longs
                            const label = item[0];
                            return label.length > 30 ? label.substring(0, 27) + '...' : label;
                        }),
                        datasets: [{
                            data: limitedData.map(item => item[1]),
                            backgroundColor: this.colors.chartPalette.slice(0, limitedData.length),
                            borderWidth: 1
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            x: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Nombre de réponses'
                                }
                            }
                        }
                    }
                });

                this.charts.set(chartId, chart);
                console.log(`✅ Graphique question créé: ${chartId}`);
            } catch (error) {
                console.error(`❌ Erreur création graphique ${chartId}:`, error);
            }
        }

        // Messages d'erreur pour graphiques
        displayChartsUnavailableMessage() {
            const chartContainers = document.querySelectorAll('.chart-container canvas');
            chartContainers.forEach(canvas => {
                const container = canvas.parentElement;
                container.innerHTML = `
                    <div class="chart-placeholder">
                        <div style="font-size: 2rem; margin-bottom: 10px;">📊</div>
                        <div style="font-size: 0.9rem; text-align: center;">
                            <strong>Graphique non disponible</strong><br>
                            Chart.js n'a pas pu être chargé
                        </div>
                    </div>
                `;
            });
        }

        displayChartsErrorMessage() {
            const chartContainers = document.querySelectorAll('.chart-container canvas');
            chartContainers.forEach(canvas => {
                const container = canvas.parentElement;
                container.innerHTML = `
                    <div class="chart-placeholder chart-error">
                        <div style="font-size: 2rem; margin-bottom: 10px;">⚠️</div>
                        <div style="font-size: 0.9rem; text-align: center;">
                            <strong>Erreur graphique</strong><br>
                            Impossible de générer le graphique
                        </div>
                    </div>
                `;
            });
        }

        // ===== ÉVÉNEMENTS =====
        setupGlobalStatsEvents() {
            console.log('🎛️ Configuration des événements des statistiques globales...');
            
            // Toggle questions
            const toggleAllBtn = document.getElementById('toggleAllQuestions');
            if (toggleAllBtn) {
                toggleAllBtn.addEventListener('click', () => {
                    const allDetails = document.querySelectorAll('.question-details');
                    const isExpanded = toggleAllBtn.textContent.includes('Tout réduire');
                    
                    allDetails.forEach(detail => {
                        detail.style.display = isExpanded ? 'none' : 'block';
                    });
                    
                    toggleAllBtn.textContent = isExpanded ? 'Tout développer' : 'Tout réduire';
                    console.log(`📋 Questions ${isExpanded ? 'réduites' : 'développées'}`);
                });
            }

            // Export PDF
            const exportBtn = document.getElementById('exportGlobalPDF');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    console.log('📄 Lancement export PDF global...');
                    try {
                        if (window.exportGlobalPDF) {
                            window.exportGlobalPDF();
                        } else {
                            this.exportGlobalPDF();
                        }
                    } catch (error) {
                        console.error('❌ Erreur export PDF:', error);
                        alert('Erreur lors de l\'export PDF: ' + error.message);
                    }
                });
            }
            
            console.log('✅ Événements des statistiques globales configurés');
        }

        // ===== EXPORT PDF (version basique) =====
        exportGlobalPDF() {
            if (!this.globalData) {
                console.error('Aucune donnée globale à exporter');
                return;
            }

            console.log('📄 Export PDF global (version basique)...');
            
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // En-tête
            doc.setFillColor(79, 172, 254);
            doc.rect(0, 0, 210, 40, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text('RAPPORT GLOBAL - ENQUETES SATISFACTION CRECHES', 105, 20, { align: 'center' });
            
            // Contenu de base
            let y = 60;
            doc.setTextColor(51, 51, 51);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            
            const lines = [
                `Établissements analysés: ${this.globalData.metadata.totalEtablissements}`,
                `Réponses collectées: ${this.globalData.metadata.totalReponses}`,
                `Satisfaction globale: ${this.globalData.satisfaction.stats.byMethod.weighted}%`,
                `Date d'analyse: ${new Date().toLocaleDateString('fr-FR')}`
            ];
            
            lines.forEach(line => {
                doc.text(line, 20, y);
                y += 8;
            });
            
            // Sauvegarde
            const fileName = `rapport_global_creches_strasbourg_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);
            
            console.log('✅ Export PDF global terminé');
        }

        // ===== MÉTHODES UTILITAIRES =====
        calculateSurveyPeriod(rawData) {
            const dates = rawData.map(r => r.date).filter(d => d);
            if (dates.length === 0) return 'Non spécifiée';
            
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            
            if (minDate.getTime() === maxDate.getTime()) {
                return minDate.toLocaleDateString('fr-FR');
            }
            
            return `${minDate.toLocaleDateString('fr-FR')} - ${maxDate.toLocaleDateString('fr-FR')}`;
        }

        destroyCharts() {
            this.charts.forEach(chart => {
                if (chart && typeof chart.destroy === 'function') {
                    chart.destroy();
                }
            });
            this.charts.clear();
        }

        reset() {
            this.destroyCharts();
            this.globalData = null;
        }
    }

    // ===== FONCTIONS GLOBALES POUR L'INTERFACE =====
    window.toggleQuestion = function(questionId) {
        const details = document.getElementById(questionId);
        const header = details.previousElementSibling;
        const icon = header.querySelector('.toggle-icon');
        
        if (details.style.display === 'none') {
            details.style.display = 'block';
            icon.textContent = '▲';
        } else {
            details.style.display = 'none';
            icon.textContent = '▼';
        }
    };

    // NOUVELLE FONCTION: Filtrage des tableaux de réponses ouvertes
    window.filterOpenResponsesTable = function(questionTitle, gestionnaire) {
        console.log(`🔍 Filtrage tableau pour: "${questionTitle}", gestionnaire: "${gestionnaire}"`);
        
        const tableBodyId = `openResponsesTableBody-${questionTitle.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const tableBody = document.getElementById(tableBodyId);
        
        if (tableBody) {
            const rows = tableBody.querySelectorAll('.open-response-row');
            let visibleCount = 0;
            
            rows.forEach(row => {
                const rowGestionnaire = row.dataset.gestionnaire;
                const shouldShow = !gestionnaire || rowGestionnaire === gestionnaire;
                row.style.display = shouldShow ? '' : 'none';
                if (shouldShow) visibleCount++;
            });
            
            console.log(`📊 ${visibleCount} réponses affichées sur ${rows.length}`);
        }
    };
    
    window.showAllResponses = function(questionTitle) {
        console.log(`📋 Affichage de toutes les réponses pour: "${questionTitle}"`);
        // Réinitialiser le filtre
        window.filterOpenResponsesTable(questionTitle, '');
    };

    // ===== EXPORT DE LA CLASSE =====
    if (typeof window.GlobalStatsManager === 'undefined') {
        window.GlobalStatsManager = GlobalStatsManager;
        console.log('✅ GlobalStatsManager optimisé chargé');
    } else {
        console.log('ℹ️ GlobalStatsManager mis à jour avec optimisations');
        window.GlobalStatsManager = GlobalStatsManager;
    }

})();