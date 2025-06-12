// pdf-formatter.js - Version complète et corrigée

class AdvancedPDFExporter {
    constructor() {
        // Couleurs extraites de styles.css pour cohérence visuelle
        this.colors = {
            // Couleurs principales de l'interface
            primary: [79, 172, 254],        // #4facfe - bleu principal
            primaryEnd: [0, 242, 254],      // #00f2fe - fin du gradient bleu
            secondary: [240, 147, 251],     // #f093fb - rose principal  
            secondaryEnd: [245, 87, 108],   // #f5576c - fin du gradient rose
            
            // Couleurs des gestionnaires
            ville: [79, 172, 254],          // Bleu ville
            alef: [67, 233, 123],           // Vert ALEF
            ages: [250, 112, 154],          // Rose AGES
            agf: [168, 237, 234],           // Cyan AGF
            fondation: [255, 189, 179],     // Saumon Fondation
            apedi: [102, 126, 234],         // Violet APEDI
            aasbr: [102, 126, 234],         // Violet par défaut
            fosse: [102, 126, 234],         // Violet par défaut
            
            // Couleurs de satisfaction
            satisfaction: {
                tresSatisfait: [67, 233, 123],      // Vert
                plutotSatisfait: [79, 172, 254],    // Bleu
                peuSatisfait: [250, 112, 154],      // Rose
                pasSatisfait: [255, 107, 107]       // Rouge
            },
            
            // Couleurs de texte et arrière-plans
            text: [33, 37, 41],             // #212529 - texte principal
            textSecondary: [102, 102, 102], // #666 - texte secondaire
            textLight: [73, 80, 87],        // #495057 - texte moyen
            background: [248, 249, 250],    // #f8f9fa - fond clair
            backgroundWhite: [255, 255, 255], // Blanc
            border: [222, 226, 230],        // #dee2e6 - bordures
            borderLight: [233, 236, 239],   // #e9ecef - bordures claires
            
            // Couleurs d'état
            success: [40, 167, 69],         // #28a745 - succès
            warning: [255, 193, 7],         // #ffc107 - avertissement
            danger: [220, 53, 69],          // #dc3545 - danger
            
            // Nuances de gris
            lightGray: [245, 246, 247],
            mediumGray: [206, 212, 218],
            darkGray: [134, 142, 150]
        };
        
        // Configuration des marges et espacements
        this.margins = {
            left: 20,
            right: 20,
            top: 20,
            bottom: 25
        };
        
        this.pageWidth = 210;
        this.pageHeight = 297;
        this.contentWidth = this.pageWidth - this.margins.left - this.margins.right;
    }

    getGestionnaireColor(gestionnaire) {
        const colorMap = {
            'Ville de Strasbourg': this.colors.ville,
            'AASBR [AASBR]': this.colors.aasbr,
            'AGES': this.colors.ages,
            'AGF': this.colors.agf,
            'ALEF': this.colors.alef,
            'Fondation d\'Auteuil': this.colors.fondation,
            'Fossé des treize': this.colors.fosse,
            'APEDI': this.colors.apedi
        };
        return colorMap[gestionnaire] || this.colors.primary;
    }

    getSatisfactionColor(niveau) {
        const colorMap = {
            'Très satisfait': this.colors.satisfaction.tresSatisfait,
            'Plutôt satisfait': this.colors.satisfaction.plutotSatisfait,
            'Peu satisfait': this.colors.satisfaction.peuSatisfait,
            'Pas satisfait': this.colors.satisfaction.pasSatisfait
        };
        return colorMap[niveau] || this.colors.primary;
    }

    exportEtablissementToPDF(name, surveyData, analyzer) {
        if (!surveyData[name]) {
            console.error('Données non trouvées pour l\'établissement:', name);
            return;
        }

        const data = surveyData[name];
        const gestionnaire = Object.keys(data.gestionnaire)[0] || 'Non spécifié';
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        let currentY = this.margins.top;

        // En-tête avec couleurs de l'interface
        this.addStyledHeader(doc, name, gestionnaire);
        currentY = 55;

        // Section résumé avec style interface
        currentY = this.addSummarySection(doc, currentY, name, gestionnaire, data, analyzer);
        currentY += 10;

        // Questions avec formatage similaire à la vue détail
        const orderedQuestions = this.getOrderedQuestions(data);
        
        orderedQuestions.forEach(({ key, qData }) => {
            if (qData.totalResponses === 0) return;
            
            const estimatedHeight = this.estimateQuestionHeight(qData, analyzer);
            if (currentY + estimatedHeight > this.pageHeight - this.margins.bottom) {
                doc.addPage();
                currentY = this.margins.top;
            }

            currentY = this.addStyledQuestionSection(doc, currentY, qData, analyzer);
        });

        // Pied de page avec style
        this.addStyledFooter(doc);

        // Sauvegarde
        const cleanName = name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
        const fileName = `rapport_${cleanName}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
    }

    addStyledHeader(doc, name, gestionnaire) {
        // En-tête principal avec gradient simulé
        doc.setFillColor(...this.colors.primary);
        doc.rect(0, 0, this.pageWidth, 50, 'F');
        
        // Effet de gradient
        doc.setFillColor(...this.colors.primaryEnd);
        doc.setGState(doc.GState({opacity: 0.7}));
        doc.rect(0, 0, this.pageWidth, 35, 'F');
        doc.setGState(doc.GState({opacity: 1}));

        // Titre principal SANS ÉMOJIS
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('RAPPORT D\'ANALYSE - ENQUETE SATISFACTION', this.pageWidth / 2, 15, { align: 'center' });
        
        // Nom de l'établissement
        doc.setFontSize(13);
        doc.setFont('helvetica', 'normal');
        const cleanName = name.replace(/[^\w\s\-àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/gi, '');
        doc.text(cleanName, this.pageWidth / 2, 25, { align: 'center' });
        
        // Badge gestionnaire avec couleur spécifique
        const gestionnaireColor = this.getGestionnaireColor(gestionnaire);
        doc.setFillColor(...gestionnaireColor);
        doc.roundedRect(this.pageWidth/2 - 35, 30, 70, 12, 3, 3, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Gestionnaire: ${gestionnaire}`, this.pageWidth / 2, 37, { align: 'center' });
        
        // Ligne décorative
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(1);
        doc.line(20, 45, this.pageWidth - 20, 45);
    }

    addSummarySection(doc, startY, name, gestionnaire, data, analyzer) {
        let y = startY + 5;
        
        // Fond avec style similaire à la vue détail
        doc.setFillColor(...this.colors.background);
        doc.roundedRect(this.margins.left, y, this.contentWidth, 40, 5, 5, 'F');
        
        // Bordure gauche colorée
        doc.setFillColor(...this.colors.primary);
        doc.rect(this.margins.left, y, 4, 40, 'F');

        // Titre de section SANS ÉMOJIS
        doc.setTextColor(...this.colors.text);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('VUE D\'ENSEMBLE', this.margins.left + 10, y + 10);

        // Métriques en grille
        y += 18;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        const satisfaction = analyzer.calculateSatisfactionPercentage(data.satisfaction);
        const satisfactionColor = satisfaction >= 80 ? this.colors.satisfaction.tresSatisfait :
                                 satisfaction >= 60 ? this.colors.satisfaction.plutotSatisfait :
                                 satisfaction >= 40 ? this.colors.satisfaction.peuSatisfait :
                                 this.colors.satisfaction.pasSatisfait;

        const metrics = [
            {
                label: 'Reponses totales',
                value: `${data.totalReponses}`,
                color: this.colors.primary
            },
            {
                label: 'Satisfaction globale', 
                value: `${satisfaction}%`,
                color: satisfactionColor
            },
            {
                label: 'Date du rapport',
                value: new Date().toLocaleDateString('fr-FR'),
                color: this.colors.textSecondary
            }
        ];

        const metricWidth = (this.contentWidth - 20) / 3;
        metrics.forEach((metric, index) => {
            const x = this.margins.left + 10 + (index * metricWidth);
            
            // Fond de métrique
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(x, y, metricWidth - 5, 18, 3, 3, 'F');
            
            // Label
            doc.setTextColor(...this.colors.textSecondary);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.text(metric.label, x + 3, y + 6);
            
            // Valeur avec couleur spécifique
            doc.setTextColor(...metric.color);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text(metric.value, x + 3, y + 14);
        });

        return y + 25;
    }

    getOrderedQuestions(data) {
        return Object.entries(data.questionStats)
            .map(([key, qData]) => ({ key, qData }))
            .sort((a, b) => (a.qData.columnIndex || 0) - (b.qData.columnIndex || 0));
    }

    estimateQuestionHeight(qData, analyzer) {
        // Estimation simple et sûre
        let height = 50; // Base généreuse pour le titre
        
        // Estimation simple : 1 ligne par 50 caractères, max 5 lignes
        const estimatedLines = Math.min(Math.ceil(qData.question.length / 50), 5);
        const titleHeight = Math.max(20, estimatedLines * 6 + 15);
        height += titleHeight;
        
        if (qData.isOpenQuestion || qData.responsesList?.length > 0) {
            height += 15; // En-tête tableau
            height += Math.min((qData.responsesList?.length || 0) * 35, 250); // Espace généreux par ligne
        } else {
            const answersCount = qData.answers ? Object.keys(qData.answers).length : 0;
            height += answersCount * 25; // Espace généreux par réponse
        }
        
        return height + 40; // Grande marge de sécurité
    }

    addStyledQuestionSection(doc, startY, qData, analyzer) {
        let y = startY;
        
        // Titre de question avec approche sécurisée
        doc.setTextColor(...this.colors.text);
        doc.setFontSize(8); // Police de base
        doc.setFont('helvetica', 'bold');
        
        // Largeur très conservative
        const safeTitleWidth = this.contentWidth - 30;
        
        // Utiliser la fonction native de jsPDF pour les retours à la ligne
        const titleLines = doc.splitTextToSize(qData.question, safeTitleWidth);
        
        // Limiter strictement à 5 lignes
        let finalTitleLines = titleLines.slice(0, 5);
        if (titleLines.length > 5) {
            // Tronquer la dernière ligne proprement
            const lastLineIndex = finalTitleLines.length - 1;
            const lastLine = finalTitleLines[lastLineIndex];
            if (lastLine.length > 5) {
                finalTitleLines[lastLineIndex] = lastLine.substring(0, lastLine.length - 3) + '...';
            }
        }
        
        // Hauteur généreuse basée sur le nombre de lignes réel
        const lineSpacing = 6; // Espacement entre les lignes
        const titleHeight = Math.max(22, finalTitleLines.length * lineSpacing + 16);
        
        // Vérifier l'espace disponible
        if (y + titleHeight + 35 > this.pageHeight - this.margins.bottom) {
            doc.addPage();
            y = this.margins.top;
        }
        
        // Fond de question avec bordure gauche colorée
        doc.setFillColor(...this.colors.background);
        doc.roundedRect(this.margins.left, y, this.contentWidth, titleHeight, 3, 3, 'F');
        
        // Bordure gauche bleue
        doc.setFillColor(...this.colors.primary);
        doc.rect(this.margins.left, y, 4, titleHeight, 'F');
        
        // Affichage du titre centré verticalement
        const textStartY = y + (titleHeight - (finalTitleLines.length * lineSpacing)) / 2 + lineSpacing;
        
        finalTitleLines.forEach((line, index) => {
            doc.text(line, this.margins.left + 12, textStartY + (index * lineSpacing));
        });
        
        y += titleHeight + 5;

        // Nombre de réponses
        doc.setTextColor(...this.colors.textSecondary);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text(`${qData.totalResponses} reponse${qData.totalResponses > 1 ? 's' : ''}`, this.margins.left, y);
        y += 10;

        // Détecter le type de question avec logique renforcée
        const questionLower = qData.question.toLowerCase();
        
        // Questions "Si non" sont des choix multiples, PAS des questions ouvertes
        const isSiNonQuestion = questionLower.includes('si non') ||
                               questionLower.includes('si "non"') ||
                               questionLower.startsWith('si non') ||
                               questionLower.includes('si non, pourquoi') ||
                               questionLower.includes('si non, pouvez-vous préciser');
        
        // Questions VRAIMENT ouvertes (commentaires libres SEULEMENT)
        const isDefinitelyOpen = !isSiNonQuestion && (
                               questionLower.includes('remarques') || 
                               questionLower.includes('suggestions') || 
                               questionLower.includes('complémentaires') ||
                               questionLower.includes('commentaire') ||
                               questionLower.includes('avez-vous des remarques')
                               // Enlever "préciser" et "pourquoi" car souvent des choix multiples
                               );
        
        // Analyser le contenu des réponses pour détecter les choix multiples
        let hasMultipleChoices = false;
        let hasStructuredAnswers = false;
        
        if (qData.answers && Object.keys(qData.answers).length > 0) {
            hasStructuredAnswers = true;
            // Vérifier si les réponses contiennent des séparateurs (signe de choix multiples)
            const answerKeys = Object.keys(qData.answers);
            hasMultipleChoices = answerKeys.some(answer => 
                answer.includes(';') || 
                answer.includes(',') || 
                answer.includes('|') ||
                answer.includes(' : ') || // Format "Question : réponse"
                answerKeys.length > 1 // Plus d'une réponse possible = choix multiples
            );
        }
        
        // Analyser responsesList pour détecter des patterns de choix multiples
        if (qData.responsesList && qData.responsesList.length > 0) {
            const responses = qData.responsesList.map(r => r.answer);
            hasMultipleChoices = hasMultipleChoices || responses.some(response => 
                response.includes(';') || 
                response.includes(',') || 
                response.includes('|') ||
                response.includes(' : ') // Format "Option : détail"
            );
            
            // Si les réponses sont courtes et répétitives, c'est probablement fermé
            const uniqueResponses = [...new Set(responses)];
            const avgLength = responses.reduce((sum, r) => sum + r.length, 0) / responses.length;
            if (uniqueResponses.length <= 15 && avgLength <= 100) {
                hasStructuredAnswers = true;
            }
        }
        
        // Forcer les questions fermées (INCLURE les questions "Si non")
        const isDefinitelyClosed = isSiNonQuestion || // PRIORITÉ aux questions "Si non"
                                  qData.isMultiOptions || // Marqué explicitement
                                  hasMultipleChoices || // Contient des séparateurs
                                  hasStructuredAnswers || // A des answers structurées
                                  questionLower.includes('satisfait') ||
                                  questionLower.includes('oui') ||
                                  questionLower.includes('non') ||
                                  questionLower.includes('toujours') ||
                                  questionLower.includes('souvent') ||
                                  questionLower.includes('parfois') ||
                                  questionLower.includes('jamais') ||
                                  questionLower.includes('très') ||
                                  questionLower.includes('plutôt') ||
                                  questionLower.includes('peu') ||
                                  questionLower.includes('pas') ||
                                  questionLower.includes('beaucoup') ||
                                  questionLower.includes('moyennement') ||
                                  questionLower.includes('propose') ||
                                  questionLower.includes('accompagne') ||
                                  questionLower.includes('permet') ||
                                  questionLower.includes('répond') ||
                                  questionLower.includes('construite') ||
                                  questionLower.includes('respecte');

        // Logique de décision : PRIVILÉGIER FORTEMENT les questions fermées
        if (!isDefinitelyOpen && (isDefinitelyClosed || hasStructuredAnswers || hasMultipleChoices || isSiNonQuestion)) {
            y = this.addStyledClosedQuestionBars(doc, y, qData, analyzer);
        } else if (isDefinitelyOpen && !isSiNonQuestion) {
            y = this.addStyledOpenQuestionTable(doc, y, qData);
        } else {
            // En cas de doute, traiter en barres si on a des données quantifiables
            if ((qData.answers && Object.keys(qData.answers).length > 0) || 
                (qData.responsesList && qData.responsesList.length > 0)) {
                y = this.addStyledClosedQuestionBars(doc, y, qData, analyzer);
            } else {
                y = this.addStyledOpenQuestionTable(doc, y, qData);
            }
        }

        return y + 10;
    }

    addStyledOpenQuestionTable(doc, startY, qData) {
        let y = startY;
        
        if (!qData.responsesList || qData.responsesList.length === 0) {
            if (qData.answers && Object.keys(qData.answers).length > 0) {
                qData.responsesList = [];
                Object.entries(qData.answers).forEach(([answer, count]) => {
                    for (let i = 0; i < count; i++) {
                        qData.responsesList.push({
                            answer: answer,
                            respondentId: qData.responsesList.length + 1,
                            genre: 'Non spécifié',
                            csp: 'Non spécifié'
                        });
                    }
                });
            } else {
                return y;
            }
        }
        
        // En-tête du tableau simplifié (sans colonne profil) AVEC COULEURS
        doc.setFillColor(...this.colors.primary);
        doc.roundedRect(this.margins.left, y, this.contentWidth, 12, 2, 2, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        
        // Alignement vertical centré dans l'en-tête - 2 colonnes seulement
        const headerTextY = y + 8;
        doc.text('N°', this.margins.left + 8, headerTextY);
        doc.text('Reponse', this.margins.left + 25, headerTextY);
        
        // Une seule ligne de séparation
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.5);
        doc.line(this.margins.left + 20, y, this.margins.left + 20, y + 12);
        
        y += 12;

        // Réponses avec plus d'espace pour le texte AVEC COULEURS
        qData.responsesList.forEach((item, index) => {
            // Plus d'espace pour les réponses (toute la largeur moins la colonne numéro)
            const maxResponseWidth = this.contentWidth - 25;
            
            // PLUS DE LIMITATION sur la longueur - afficher le texte complet
            let responseText = item.answer;
            // Augmenter la limite considérablement pour les questions vraiment ouvertes
            if (responseText.length > 800) {
                responseText = responseText.substring(0, 797) + '...';
            }
            
            const responseLines = doc.splitTextToSize(responseText, maxResponseWidth);
            
            // PLUS de lignes autorisées pour afficher tout le contenu
            const maxLines = 12; // Doublé pour plus de contenu
            const actualResponseLines = responseLines.slice(0, maxLines);
            if (responseLines.length > maxLines) {
                actualResponseLines[maxLines - 1] = actualResponseLines[maxLines - 1].substring(0, actualResponseLines[maxLines - 1].length - 3) + '...';
            }
            
            // Hauteur basée sur le contenu réel
            const neededHeight = Math.max(actualResponseLines.length * 4.5, 18) + 8;
            
            if (y + neededHeight > this.pageHeight - this.margins.bottom) {
                doc.addPage();
                y = this.margins.top;
                
                // Redessiner l'en-tête simplifié AVEC COULEURS
                doc.setFillColor(...this.colors.primary);
                doc.roundedRect(this.margins.left, y, this.contentWidth, 12, 2, 2, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.text('N°', this.margins.left + 8, y + 8);
                doc.text('Reponse', this.margins.left + 25, y + 8);
                doc.setDrawColor(255, 255, 255);
                doc.line(this.margins.left + 20, y, this.margins.left + 20, y + 12);
                y += 12;
            }

            // Fond alternant AVEC COULEURS
            if (index % 2 === 0) {
                doc.setFillColor(...this.colors.backgroundWhite);
            } else {
                doc.setFillColor(...this.colors.background);
            }
            doc.roundedRect(this.margins.left, y, this.contentWidth, neededHeight, 1, 1, 'F');

            // Bordure subtile AVEC COULEURS
            doc.setDrawColor(...this.colors.border);
            doc.setLineWidth(0.3);
            doc.roundedRect(this.margins.left, y, this.contentWidth, neededHeight, 1, 1, 'S');
            
            // Une seule ligne de séparation
            doc.line(this.margins.left + 20, y, this.margins.left + 20, y + neededHeight);

            // Contenu avec alignement vertical centré AVEC COULEURS
            doc.setTextColor(...this.colors.text);
            doc.setFontSize(7.5); // Taille légèrement réduite pour plus de contenu
            
            // Calcul de l'alignement vertical
            const contentStartY = y + 6; // Démarrer plus haut
            
            // Numéro centré horizontalement et verticalement
            doc.setFont('helvetica', 'bold');
            doc.text(`${index + 1}`, this.margins.left + 10, contentStartY + 6);
            
            // Réponse avec plus d'espace et interligne réduit
            doc.setFont('helvetica', 'normal');
            actualResponseLines.forEach((line, lineIndex) => {
                doc.text(line, this.margins.left + 23, contentStartY + (lineIndex * 4.5));
            });

            y += neededHeight;
        });

        return y;
    }

    addStyledClosedQuestionBars(doc, startY, qData, analyzer) {
        let y = startY;
        
        // S'assurer qu'on a des données à traiter et les convertir si nécessaire
        if (!qData.answers || Object.keys(qData.answers).length === 0) {
            // Si pas de answers mais des responsesList, les convertir
            if (qData.responsesList && qData.responsesList.length > 0) {
                qData.answers = {};
                qData.responsesList.forEach(item => {
                    let answer = item.answer;
                    
                    // Gérer les choix multiples séparés par des délimiteurs
                    if (answer.includes(';')) {
                        const choices = answer.split(';').map(c => c.trim()).filter(c => c);
                        choices.forEach(choice => {
                            qData.answers[choice] = (qData.answers[choice] || 0) + 1;
                        });
                    } else if (answer.includes(',')) {
                        const choices = answer.split(',').map(c => c.trim()).filter(c => c);
                        if (choices.length > 1) {
                            choices.forEach(choice => {
                                qData.answers[choice] = (qData.answers[choice] || 0) + 1;
                            });
                        } else {
                            qData.answers[answer] = (qData.answers[answer] || 0) + 1;
                        }
                    } else {
                        // Réponse simple
                        qData.answers[answer] = (qData.answers[answer] || 0) + 1;
                    }
                });
                
                // Marquer comme choix multiples si on a détecté des séparateurs
                const hasMultipleChoicesPerResponse = qData.responsesList.some(item => 
                    item.answer.includes(';') || item.answer.includes(',')
                );
                if (hasMultipleChoicesPerResponse) {
                    qData.isMultiOptions = true;
                }
            } else {
                // Aucune donnée à afficher
                return y;
            }
        }
        
        // Recalculer le total si on a converti des responsesList
        if (qData.responsesList && qData.responsesList.length > 0 && !qData.totalResponses) {
            qData.totalResponses = qData.responsesList.length;
        }
        
        const percentages = qData.isMultiOptions ? 
            analyzer.calculatePercentages(qData.answers, qData.totalResponses) :
            analyzer.calculatePercentages(qData.answers, qData.totalResponses);

        const sortedEntries = Object.entries(percentages)
            .sort((a, b) => b[1].percentage - a[1].percentage);

        if (sortedEntries.length === 0) {
            return y; // Pas de données à afficher
        }

        sortedEntries.forEach(([answer, stats], index) => {
            if (y + 22 > this.pageHeight - this.margins.bottom) {
                doc.addPage();
                y = this.margins.top;
            }

            // Fond de réponse plus haut pour accommoder plus de texte AVEC COULEURS
            doc.setFillColor(...this.colors.background);
            doc.roundedRect(this.margins.left, y, this.contentWidth, 18, 2, 2, 'F');

            // Texte de la réponse avec gestion multi-lignes si nécessaire
            doc.setTextColor(...this.colors.text);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            
            // Plus d'espace pour le texte, réservant l'espace pour les stats
            const maxAnswerWidth = this.contentWidth - 75;
            
            // Nettoyer le texte de la réponse (enlever préfixes des choix multiples)
            let cleanAnswer = answer;
            if (cleanAnswer.includes(' : ')) {
                const parts = cleanAnswer.split(' : ');
                cleanAnswer = parts[parts.length - 1]; // Prendre la dernière partie après ':'
            }
            
            // Utiliser splitTextToSize pour gestion automatique des retours à la ligne
            const answerLines = doc.splitTextToSize(cleanAnswer, maxAnswerWidth);
            
            // Limiter à 2 lignes maximum pour les réponses fermées
            let displayLines = answerLines.slice(0, 2);
            if (answerLines.length > 2) {
                // Tronquer la seconde ligne si nécessaire
                if (displayLines[1].length > 40) {
                    displayLines[1] = displayLines[1].substring(0, 37) + '...';
                }
            }
            
            // Ajuster la hauteur en fonction du nombre de lignes
            const actualHeight = displayLines.length > 1 ? 18 : 16;
            
            // Redessiner le fond avec la bonne hauteur AVEC COULEURS
            doc.setFillColor(...this.colors.background);
            doc.roundedRect(this.margins.left, y, this.contentWidth, actualHeight, 2, 2, 'F');
            
            // Afficher le texte ligne par ligne
            displayLines.forEach((line, lineIndex) => {
                doc.text(line, this.margins.left + 4, y + 8 + (lineIndex * 6));
            });

            // Position de la barre ajustée selon la hauteur AVEC COULEURS
            const barY = y + Math.floor(actualHeight / 2) - 3;
            const barWidth = 40;
            const barHeight = 6;
            const barX = this.margins.left + this.contentWidth - barWidth - 35;
            
            // Fond de la barre AVEC COULEURS
            doc.setFillColor(...this.colors.borderLight);
            doc.roundedRect(barX, barY, barWidth, barHeight, 3, 3, 'F');
            
            // Barre colorée selon le pourcentage AVEC COULEURS
            const fillWidth = (stats.percentage / 100) * barWidth;
            let barColor;
            if (stats.percentage >= 80) barColor = this.colors.satisfaction.tresSatisfait;
            else if (stats.percentage >= 60) barColor = this.colors.satisfaction.plutotSatisfait;
            else if (stats.percentage >= 30) barColor = this.colors.satisfaction.peuSatisfait;
            else barColor = this.colors.satisfaction.pasSatisfait;
            
            doc.setFillColor(...barColor);
            doc.roundedRect(barX, barY, fillWidth, barHeight, 3, 3, 'F');

            // Pourcentage et nombre alignés avec la barre AVEC COULEURS
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(...this.colors.text);
            doc.text(`${stats.count} (${stats.percentage}%)`, barX + barWidth + 3, barY + 4);

            y += actualHeight + 2;
        });

        return y;
    }

    addStyledFooter(doc) {
        const pageCount = doc.internal.getNumberOfPages();
        
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            
            // Ligne de séparation AVEC COULEURS
            doc.setDrawColor(...this.colors.primary);
            doc.setLineWidth(0.8);
            doc.line(this.margins.left, this.pageHeight - 18, this.pageWidth - this.margins.right, this.pageHeight - 18);
            
            // Informations du pied de page AVEC COULEURS
            doc.setFontSize(7);
            doc.setTextColor(...this.colors.textSecondary);
            doc.setFont('helvetica', 'normal');
            
            // Date de génération
            doc.text(`Genere le ${new Date().toLocaleDateString('fr-FR')} a ${new Date().toLocaleTimeString('fr-FR')}`, 
                     this.margins.left, this.pageHeight - 10);
            
            // Numéro de page AVEC COULEURS
            doc.setTextColor(...this.colors.primary);
            doc.setFont('helvetica', 'bold');
            doc.text(`Page ${i} sur ${pageCount}`, this.pageWidth / 2, this.pageHeight - 10, { align: 'center' });
            
            // Signature AVEC COULEURS
            doc.setTextColor(...this.colors.textLight);
            doc.setFont('helvetica', 'bold');
            doc.text('Survey Analyzer Pro', this.pageWidth - this.margins.right, this.pageHeight - 10, { align: 'right' });
        }
    }

    // Export JSON inchangé
    exportAllDataToJSON(surveyData, rawData) {
        if (!Object.keys(surveyData).length) return;
        
        const exportData = {
            summary: {
                totalResponses: Object.values(surveyData).reduce((sum, data) => sum + data.totalReponses, 0),
                totalEtablissements: Object.keys(surveyData).length,
                exportDate: new Date().toISOString(),
                generator: 'Survey Analyzer Pro'
            },
            etablissements: surveyData,
            rawResponses: rawData
        };
        
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `resultats_enquete_creches_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Export de la classe
window.AdvancedPDFExporter = AdvancedPDFExporter;