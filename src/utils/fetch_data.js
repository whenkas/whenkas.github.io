const axios = require('axios');
const fs = require('fs');
const path = require('path');
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
        const apiResponse = await axios.get(`https://api.coingecko.com/api/v3/coins/kaspa/market_chart/range?vs_currency=${currency}&from=${startTimestamp}&to=${endTimestamp}`);
        const apiData = apiResponse.data.prices;

        if (!apiData || apiData.length === 0) {
            console.log({ kaspaResponse: apiResponse });
            throw new Error('No data found');
        }

        // Prepare new CSV data, keeping only the first data point per day
        const newCsvData = [];
        const seenDates = new Set();

        apiData.forEach(([date, price]) => {
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

        // Merge data, preferring existing data
        const dataMap = new Map(existingCsvData.map(([date, price]) => [date, [date, price]]));
        newCsvData.forEach(([date, price]) => {
            if (!dataMap.has(date)) {
                dataMap.set(date, [date, price]);
            }
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

// Function to fetch and save hashrate data
async function fetchAndSaveHashrate(url, folder, filename, isBitcoin = false) {
    try {
        const response = await axios.get(url);
        let hashrate = parseFloat(response.data);
        if (isBitcoin) {
            hashrate *= 1e9;
        }
        else {
            hashrate *= 1e12; // Convert terahashes to hashes
        }

        const today = moment().format('YYYY-MM-DD');

        const filePath = path.join(folder, filename);
        let existingData = [];

        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const parsedData = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
            existingData = parsedData.data.map(entry => [entry['Start'], parseFloat(entry['Open'])]);
        }

        const dataMap = new Map(existingData.map(([date, rate]) => [date, [date, rate]]));

        // Only set new data if the date does not already exist
        if (!dataMap.has(today)) {
            dataMap.set(today, [today, hashrate]);
        }

        const mergedData = Array.from(dataMap.values());

        stringify(mergedData, { header: true, columns: ['Start', 'Open'] }, (err, output) => {
            if (err) throw err;

            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
            }

            fs.writeFile(filePath, output, (err) => {
                if (err) throw err;
                console.log(`Data saved to ${filePath}`);
            });
        });
    } catch (error) {
        console.error(`Error fetching hashrate from ${url}:`, error);
    }
}
const defaultFolderPath = path.join(__dirname, '../../public/data');
const folderPath = process.argv[2] || defaultFolderPath;

const bitcoinUrl = 'https://blockchain.info/q/hashrate';
const kaspaUrl = 'https://api.kaspa.org/info/hashrate?stringOnly=true';

fetchAndSaveKaspaPriceHistory(folderPath, 'btc');
fetchAndSaveHashrate(bitcoinUrl, folderPath, 'bitcoin_hashrate_api.csv', true); // Pass true for Bitcoin
fetchAndSaveHashrate(kaspaUrl, folderPath, 'kaspa_hashrate_api.csv'); // No need to pass true for Kaspa