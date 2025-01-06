When Kas

A predictor for when kaspa overtakes bitcoin. It finds when kaspa powerlaw for the kas / btc price surpasses the price for it to be worth more then bitcoin. 

See it at https://whenkas.github.io/

<img width="958" alt="image" src="https://github.com/whenkas/whenkas.github.io/assets/169737990/211ce73c-1bc2-4c84-b29f-6c50cf8ec8bc">

Data is updated daily using a github action.

If you want a fresh set of data

Price: use the Data export from here https://coincodex.com/crypto/kaspa/historical-data/, priced in btc. Select the full time range of kaspa existance, frequency Daily, currency BTC. Export. Replace file public/data/kaspa_prices_btc_historical.csv

Hashrate: Bitcoin json is here https://www.blockchain.com/explorer/charts/hash-rate. Select all timerange, export json. Replace file in whenkaspa/public/data/bitcoin_hashrate.json. Then run node src/utils/convert_bitcoin_hashrate_json_to_csv.js

Kaspa json is here https://api.minerstat.com/v2/coins-history?coin=KAS&algo=KHeavyHash . Replace file public/data/kaspa_hashrate.json. Then run node 'src/utils/convert_all_hashrates.js'


To run, get data from above, then 'yarn' && 'yarn start'

