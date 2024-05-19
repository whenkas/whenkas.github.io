const fs = require('fs');
const path = require('path');

// Get command-line arguments
const args = process.argv.slice(2);
const inputFilePath = args[0] || path.join(__dirname, '../../public/data/bitcoin_hashrate.json');
const outputFilePath = args[1] || path.join(__dirname, '../../public/data/bitcoin_hashrate_historical.csv');

// Read the JSON file
const jsonData = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));

// Convert JSON to CSV
const convertJsonToCsv = (json) => {
    const csvRows = [];
    const headers = ['Start', 'Open'];
    csvRows.push(headers.join(','));

    json['hash-rate'].forEach(entry => {
        const date = new Date(entry.x).toISOString().split('T')[0]; // Convert epoch to date string
        const open = entry.y;
        csvRows.push(`${date},${open}`);
    });

    return csvRows.join('\n');
};

// Write the CSV file
const csvData = convertJsonToCsv(jsonData);
fs.writeFileSync(outputFilePath, csvData);

console.log('JSON data has been converted to CSV format and saved to', outputFilePath);