const axios = require('axios');
const fs = require('fs');
const moment = require('moment');
const { stringify } = require('csv-stringify');
const Papa = require('papaparse');

async function fetchAndSaveKaspaPriceHistory(folder, currency = 'btc') {
    const today = moment();
    const start = moment().subtract(10, 'months');

    try {
        const startTimestamp = start.unix();
        const endTimestamp = today.unix();

        // Fetch KAS price history in the specified currency from ten months ago to today
        const kaspaResponse = await axios.get(`https://api.coingecko.com/api/v3/coins/kaspa/market_chart/range?vs_currency=${currency}&from=${startTimestamp}&to=${endTimestamp}`);
        const kaspaData = kaspaResponse.data.prices;

        if (!kaspaData || kaspaData.length === 0) {
            console.log({ kaspaResponse });
            throw new Error('No data found');
        }

        // Prepare new CSV data, keeping only the first data point per day
        const newCsvData = [];
        const seenDates = new Set();

        kaspaData.forEach(([date, price]) => {
            const dateKey = moment(date).format('YYYY-MM-DD');
            if (!seenDates.has(dateKey)) {
                seenDates.add(dateKey);
                newCsvData.push([dateKey, price]);
            }
        });

        // Load existing CSV data
        const existingFilePath = `${folder}/kaspa_prices_${currency}_api.csv`;
        let existingCsvData = [];
        if (fs.existsSync(existingFilePath)) {
            const existingCsvContent = fs.readFileSync(existingFilePath, 'utf8');
            const parsedExistingCsv = Papa.parse(existingCsvContent, { header: true, skipEmptyLines: true });
            existingCsvData = parsedExistingCsv.data.map(entry => [moment(entry['Start']).format('YYYY-MM-DD'), parseFloat(entry['Open'])]);
        }

        // Merge data, preferring new data
        const dataMap = new Map(existingCsvData.map(([date, price]) => [date, [date, price]]));
        newCsvData.forEach(([date, price]) => {
            dataMap.set(date, [date, price]);
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
        console.error(`Error fetching price history for the last ten months:`, error);
    }
}

const folderPath = process.argv[2];
fetchAndSaveKaspaPriceHistory(folderPath, 'btc');
fetchAndSaveKaspaPriceHistory(folderPath, 'eth');