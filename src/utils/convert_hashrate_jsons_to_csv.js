const fs = require('fs');
const path = require('path');

// Get command-line arguments
const args = process.argv.slice(2);
const inputFilePath = args[0] || path.join(__dirname, '../../public/data/bitcoin_hashrate.json');
const outputFilePath = args[1] || path.join(__dirname, '../../public/data/bitcoin_hashrate_historical.csv');

// Read the JSON file
const jsonData = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));

// Helper to parse existing CSV into a map
function parseCsvToMap(csv) {
    const lines = csv.trim().split('\n');
    const map = new Map();
    for (let i = 1; i < lines.length; i++) { // skip header
        const [date, open] = lines[i].split(',');
        map.set(date, open);
    }
    return map;
}

// Convert JSON to a map of date -> open
const convertJsonToMap = (json) => {
    const map = new Map();
    if (json['hash-rate']) { // bitcoin json format
        json['hash-rate'].forEach(entry => {
            const date = new Date(entry.x).toISOString().split('T')[0];
            const open = entry.y * 1e12;
            map.set(date, open);
        });
    } else if (json['KAS']) { // kaspa json format
        Object.keys(json['KAS']).forEach(epoch => {
            const date = new Date(epoch * 1000).toISOString().split('T')[0];
            let open = json['KAS'][epoch][0];
            map.set(date, open);
        });
    } else {
        throw new Error('Unsupported JSON format');
    }
    return map;
};

// Read existing CSV if it exists
let existingMap = new Map();
if (fs.existsSync(outputFilePath)) {
    const existingCsv = fs.readFileSync(outputFilePath, 'utf8');
    existingMap = parseCsvToMap(existingCsv);
}

// Convert new JSON to map
const newMap = convertJsonToMap(jsonData);

// Merge: new data overwrites old for matching dates
for (const [date, open] of newMap.entries()) {
    existingMap.set(date, open);
}

// Sort dates ascending
const allDates = Array.from(existingMap.keys()).sort();

// Write merged CSV
const headers = ['Start', 'Open'];
const csvRows = [headers.join(',')];
for (const date of allDates) {
    csvRows.push(`${date},${existingMap.get(date)}`);
}
const csvData = csvRows.join('\n');
fs.writeFileSync(outputFilePath, csvData);

console.log('JSON data has been merged and converted to CSV format and saved to', outputFilePath);