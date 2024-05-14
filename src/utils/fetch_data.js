const axios = require('axios');
const fs = require('fs');
const moment = require('moment');
const { stringify } = require('csv-stringify');
const Papa = require('papaparse');

async function fetchAndSaveKaspaPriceHistoryInBTC(folder) {
    const today = moment();
    const start = moment().subtract(10, 'months');

    try {
        const startTimestamp = start.unix();
        const endTimestamp = today.unix();

        // Fetch KAS price history in BTC from six months ago to today
        const kaspaResponse = await axios.get(`https://api.coingecko.com/api/v3/coins/kaspa/market_chart/range?vs_currency=btc&from=${startTimestamp}&to=${endTimestamp}`);
        const kaspaData = kaspaResponse.data.prices;

        if (!kaspaData || kaspaData.length === 0) {
            console.log({ kaspaResponse: kaspaResponse });
            throw new Error('No data found');
        }

        // Prepare new CSV data, keeping only the first data point per day
        const newCsvData = [];
        const seenDates = new Set();
        for (const [date, priceInBTC] of kaspaData) {
            const dateKey = new Date(date * 1000).toISOString().split('T')[0]; // Use only the date part
            if (!seenDates.has(dateKey)) {
                seenDates.add(dateKey);
                newCsvData.push([new Date(date * 1000).toISOString(), priceInBTC]);
            }
        }

        // Load existing CSV data
        const existingFilePath = `${folder}/kaspa_prices_api.csv`;
        let existingCsvData = [];
        if (fs.existsSync(existingFilePath)) {
            const existingCsvContent = fs.readFileSync(existingFilePath, 'utf8');
            const parsedExistingCsv = Papa.parse(existingCsvContent, { header: true, skipEmptyLines: true });
            existingCsvData = parsedExistingCsv.data.map(entry => [entry['Start'], entry['Open']]);
        }

        // Merge data, preferring new data
        const dataMap = new Map();
        existingCsvData.forEach(([date, price]) => {
            const dateKey = date.split('T')[0]; // Use only the date part for merging
            dataMap.set(dateKey, [date, price]);
        });
        newCsvData.forEach(([date, price]) => {
            const dateKey = date.split('T')[0]; // Use only the date part for merging
            dataMap.set(dateKey, [date, price]); // Always prefer new data
        });

        const mergedCsvData = Array.from(dataMap.values());

        // Convert merged data to CSV format
        stringify(mergedCsvData, { header: true, columns: ['Start', 'Open'] }, (err, output) => {
            if (err) throw err;

            // Ensure the folder exists
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
            }

            // Save the merged CSV file
            fs.writeFile(existingFilePath, output, (err) => {
                if (err) throw err;
                console.log(`Data saved to ${existingFilePath}`);
            });
        });
    } catch (error) {
        console.error(`Error fetching price history for the last six months:`, error);
    }
}

const folderPath = process.argv[2];
fetchAndSaveKaspaPriceHistoryInBTC(folderPath);