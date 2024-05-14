const { execSync } = require('child_process');
const path = require('path');

const bitcoinInput = path.join(__dirname, '../../public/data/bitcoin_hashrate.json');
const bitcoinOutput = path.join(__dirname, '../../public/data/bitcoin_hashrate_historical.csv');
const kaspaInput = path.join(__dirname, '../../public/data/kaspa_hashrate.json');
const kaspaOutput = path.join(__dirname, '../../public/data/kaspa_hashrate_historical.csv');

const convertScript = path.join(__dirname, 'convert_hashrate_jsons_to_csv.js');

try {
    console.log('Converting Bitcoin hashrate JSON to CSV...');
    execSync(`node ${convertScript} ${bitcoinInput} ${bitcoinOutput}`);
    console.log('Bitcoin conversion completed.');

    console.log('Converting Kaspa hashrate JSON to CSV...');
    execSync(`node ${convertScript} ${kaspaInput} ${kaspaOutput}`);
    console.log('Kaspa conversion completed.');
} catch (error) {
    console.error('Error during conversion:', error);
}