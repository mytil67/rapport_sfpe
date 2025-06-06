/**
 * aggregator.js
 * 
 * Script Node.js pour lire un fichier Excel, regrouper toutes les colonnes
 * « Question : [Option] » (cases à cocher) en une seule colonne par question,
 * puis enregistrer le fichier mis à jour.
 * 
 * Utilisation :
 *   node aggregator.js <chemin_vers_fichier_entrée.xlsx> <chemin_vers_fichier_sortie.xlsx>
 * 
 * Exemple :
 *   node aggregator.js réponses_complet.xlsx réponses_agrégées.xlsx
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Vérification des arguments passés au script
if (process.argv.length < 4) {
  console.error('Usage : node aggregator.js <entrée.xlsx> <sortie.xlsx>');
  process.exit(1);
}

const inputFilePath  = process.argv[2];
const outputFilePath = process.argv[3];

// Vérifie que le fichier d’entrée existe
if (!fs.existsSync(inputFilePath)) {
  console.error(`Le fichier d’entrée "${inputFilePath}" est introuvable.`);
  process.exit(1);
}

// 1) LECTURE DU FICHIER EXCEL
const workbook = XLSX.readFile(inputFilePath);
const sheetName = workbook.SheetNames[0]; // on prend la première feuille par défaut
const worksheet = workbook.Sheets[sheetName];
const jsonData  = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

// Si le fichier est vide ou sans données, on arrête
if (!Array.isArray(jsonData) || jsonData.length < 2) {
  console.error('Le fichier Excel ne contient pas de données exploitables.');
  process.exit(1);
}

// 2) RÉCUPÉRATION DES EN-TÊTES ET DES DONNÉES
const headers = jsonData[0].map(cell => (cell == null ? '' : cell.toString().trim()));
const rows    = jsonData.slice(1); // toutes les lignes de données, chaque ligne est un tableau

// 3) IDENTIFICATION DES GROUPES « CASES À COCHER »
// On repère toutes les colonnes dont l’en-tête matche /^(.+?)\s*:\s*\[(.+)\]$/
// et on regroupe par question de base.
const checkboxGroups = {}; // { questionBase: [ { index, optionLabel }, … ] }
const regexCheckbox   = /^(.+?)\s*:\s*\[(.+)\]$/; 

headers.forEach((h, idx) => {
  if (!h) return;
  const match = h.match(regexCheckbox);
  if (match) {
    const questionBase = match[1].trim(); // ex. "Âge de votre enfant"
    const optionLabel  = match[2].trim(); // ex. "Moins de 18 mois"
    if (!checkboxGroups[questionBase]) {
      checkboxGroups[questionBase] = [];
    }
    checkboxGroups[questionBase].push({ index: idx, option: optionLabel });
  }
});

// 4) POUR CHAQUE QUESTION « CASES À COCHER », ON CRÉE UNE COLONNE AGRÉGÉE
//    Le nom de la colonne agrégée sera l’intitulé de la question (sans les "[…]")
//    On crée d’abord un tableau de nouveaux en-têtes, en copiant
//    toutes les colonnes existantes *sauf* celles de checkbox, puis on
//    ajoute les colonnes agrégées à la fin (ou à l’emplacement de la première option).

// Identifie tous les indices à supprimer (toutes les colonnes « option »)
const indicesCheckbox = new Set();
Object.values(checkboxGroups).forEach(arr => {
  arr.forEach(({ index }) => indicesCheckbox.add(index));
});

// Construction des nouveaux en-têtes (sans les colonnes option individuels)
const newHeaders = [];
const mappingIndexToNewColumn = {}; 
// mappingIndexToNewColumn : si on veut garder l’ordre, on mémorise l’index
// de la première option de chaque groupe pour placer la colonne agrégée au bon endroit.

headers.forEach((h, idx) => {
  if (indicesCheckbox.has(idx)) {
    // saute cette colonne, elle sera remplacée par la colonne agrégée
    return;
  }
  newHeaders.push(h);
});

// Pour garder l’ordre d’origine, on va réinsérer chaque question agrégée
// à l’index minimal de son groupe (au plus petit index des colonnes options)
Object.entries(checkboxGroups).forEach(([questionBase, opts]) => {
  // calcul de l’indice minimal
  const minIndex = opts.reduce((min, o) => (o.index < min ? o.index : min), opts[0].index);

  // on va insérer la colonne agrégée à la position correspondant à la
  // place où se trouvait la première option, moins le nombre de colonnes
  // options déjà rencontrées avant cet index dans newHeaders.
  // On doit recalculer l’index d’insertion dans newHeaders :
  let offset = 0;
  for (let i = 0; i < minIndex; i++) {
    if (indicesCheckbox.has(i)) {
      offset++;
    }
  }
  const insertionPos = minIndex - offset;
  const colName = questionBase; // on enlève les deux-points si présents

  // On insère cette colonne agrégée dans newHeaders à la position insertionPos
  newHeaders.splice(insertionPos, 0, colName);

  // On mémorise pour la suite où est cette nouvelle colonne par rapport à la ligne
  mappingIndexToNewColumn[questionBase] = { newColName: colName, insertPos: insertionPos };
});

// 5) CONSTRUCTION DU NOUVEAU TABLEAU DE DONNÉES (lignes), COLONNE PAR COLONNE
// On parcourt chaque ligne de données, on construit une nouvelle ligne
// en excluant les colonnes « checkbox » et en ajoutant la valeur agrégée.

const newRows = rows.map((row) => {
  // 5.1) Commencer par copier les cellules des colonnes NON-checkbox, dans l’ordre
  const newRow = [];
  row.forEach((cell, idx) => {
    if (indicesCheckbox.has(idx)) {
      // on saute les colonnes « option » individuelles
      return;
    }
    newRow.push(cell);
  });

  // 5.2) Pour chaque question à checkbox, calculer la valeur agrégée
  Object.entries(checkboxGroups).forEach(([questionBase, opts]) => {
    // Récupérer l’emplacement où on a inséré la colonne agrégée
    const { insertPos } = mappingIndexToNewColumn[questionBase];

    // Collecter les options cochées pour cette ligne
    const sélectionnées = [];
    opts.forEach(({ index, option }) => {
      const valeurCell = row[index];
      if (valeurCell != null) {
        const str = valeurCell.toString().trim().toLowerCase();
        // On considère que toute valeur non vide et différente de 'non'/'sans réponse' = cochée
        if (str !== '' && str !== 'non' && str !== 'sans réponse' && str !== 'n/a') {
          sélectionnées.push(option);
        }
      }
    });
    const valeurAgrégée = sélectionnées.length > 0 ? sélectionnées.join('; ') : '';

    // On insère la valeur agrégée à la bonne position dans newRow
    newRow.splice(insertPos, 0, valeurAgrégée);
  });

  return newRow;
});

// 6) ASSEMBLER LA NOUVELLE FEUILLE DE CALCUL ET L’ENREGISTRER
const ws_new = XLSX.utils.aoa_to_sheet([newHeaders, ...newRows]);
const wb_new = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb_new, ws_new, sheetName);

// Vérifie si le dossier de sortie existe
const outputDir = path.dirname(outputFilePath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

XLSX.writeFile(wb_new, outputFilePath, { bookType: 'xlsx', cellDates: true });
console.log(`Le fichier agrégé a bien été créé : ${outputFilePath}`);
