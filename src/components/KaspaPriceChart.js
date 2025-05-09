import React, { useEffect, useState, useCallback } from 'react';
import Plotly from 'plotly.js-basic-dist';
import createPlotlyComponent from 'react-plotly.js/factory';
import Papa from 'papaparse';
import regression from 'regression';
import { Collapse } from 'react-collapse';

const Plot = createPlotlyComponent(Plotly);

const BITCOIN_HALVING_INTERVAL = 210000; // Blocks per halving
const BITCOIN_GENESIS_DATE = new Date('2009-01-03');
const KASPA_GENESIS_DATE = new Date('2021-11-07');
const YEARS_OUT_PRICES = 12;
const YEARS_OUT_HASHRATE = 12;

// Utility function to handle logarithmic transformations and power calculations
const logBase = (base) => {
    if (base === 'e') {
        return {
            log: (x) => Math.log(x),  // Natural logarithm
            pow: (y) => Math.exp(y)  // Exponential function
        };
    } else if (base === 2) {
        return {
            log: (x) => Math.log2(x),  // Logarithm base 2
            pow: (y) => Math.pow(2, y)  // Exponential function base 2
        };
    } else if (base === 10) {
        return {
            log: (x) => Math.log10(x),  // Logarithm base 10
            pow: (y) => Math.pow(10, y)  // Exponential function base 10
        };
    } else {
        return {
            log: (x) => Math.log(x) / Math.log(base),
            pow: (y) => Math.pow(base, y)
        };
    }
};

const KaspaPriceChart = () => {

    const urlParams = new URLSearchParams(window.location.search);
    const defaultMode = urlParams.get('mode') || 'hashrate'; // Default to 'hashrate' if no parameter is provided

    const [plotData, setPlotData] = useState([]);
    const [plotDataWithHighlights, setPlotDataWithHighlights] = useState(null);
    const [yAxisTicks, setYAxisTicks] = useState({ tickvals: [], ticktext: [] });
    const [intersectionEstimate, setIntersectionEstimate] = useState('');
    const [monthTicks, setMonthTicks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isResourcesOpen, setIsResourcesOpen] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    // Choose the base for logarithm (2 for log2, 10 for log10)
    const [logBaseSelection, setLogBaseSelection] = useState(2); // Default to log2

    // Choose the asset (btc or eth)
    const [assetSelection, setAssetSelection] = useState('btc'); // Default to btc

    const [modeSelection, setModeSelection] = useState(defaultMode); // Default to mode from URL parameter
    const [graphTitle, setGraphTitle] = useState('')
    const [lastUpdated, setLastUpdated] = useState('');
    const [minDataDate, setMinDataDate] = useState('');
    const [r2, setR2] = useState('');
    const [btcR2, setBtcR2] = useState(null);




    const { log, pow } = logBase(logBaseSelection);

    const daysSinceGenesis = (date, genesisDate) => {
        return Math.floor((date - genesisDate) / (1000 * 60 * 60 * 24));
    };
    const convertToDate = (daysSinceGenesis, genesisDate) => {
        const date = new Date(genesisDate);
        date.setDate(date.getDate() + daysSinceGenesis);
        return date;
    };

    const generateMonthTicks = (startYear, endYear, genesisDate) => {
        const ticks = [];
        for (let year = startYear; year <= endYear; year++) {
            [0, 6].forEach(month => {
                const date = new Date(year, month, 1);
                ticks.push({
                    value: daysSinceGenesis(date, genesisDate),
                    label: `${date.toLocaleString('default', { month: 'short' })} ${year}`
                });
            });
        }
        return ticks;
    };

    // Function to generate y-axis ticks as powers of 10
    const generateYTick = (minY, maxY, unit) => {
        const yTickValues = [];

        // Calculate the smallest and largest powers of 10 within the range
        const minPower = Math.floor(Math.log10(minY));
        const maxPower = Math.ceil(Math.log10(maxY));

        // Generate tick values as powers of 10
        for (let power = minPower; power <= maxPower; power++) {
            yTickValues.push(Math.pow(10, power));
        }

        // Update state with new tick values and their corresponding text
        setYAxisTicks({
            tickvals: yTickValues.map(value => log(value)), // Convert to log for plotting
            ticktext: yTickValues.map(value => `${value.toExponential(0)} ${unit.toUpperCase()}`) // Display original values with assetSelection
        });
    };




    const calculateBitcoinSupply = (currentDate) => {
        const millisecondsPerBlock = 10 * 60 * 1000;
        const blocksMined = Math.floor((currentDate - BITCOIN_GENESIS_DATE) / millisecondsPerBlock);
        let totalSupply = 0;
        let currentReward = 50;
        let blocksProcessed = 0;

        while (blocksProcessed < blocksMined) {
            let blocksThisHalving = Math.min(BITCOIN_HALVING_INTERVAL, blocksMined - blocksProcessed);
            totalSupply += blocksThisHalving * currentReward;
            blocksProcessed += blocksThisHalving;
            currentReward /= 2;
        }

        return totalSupply;
    };

    const calculateKaspaSupply = (currentDate) => {
        const preDeflationaryEndDate = new Date('2022-05-08');
        const firstTwoWeeksEndDate = new Date('2021-11-21'); // 2 weeks after Genesis Date
        const secondsInYear = 365.25 * 24 * 60 * 60;
        const preDeflationaryDuration = (preDeflationaryEndDate - firstTwoWeeksEndDate) / 1000;
        let supply = 0;

        if (currentDate <= firstTwoWeeksEndDate) {
            const secondsSinceStart = (currentDate - KASPA_GENESIS_DATE) / 1000;
            // Assuming an average reward rate of 500 KAS per second for the first 2+ weeks
            supply = 500 * secondsSinceStart;
        } else if (currentDate <= preDeflationaryEndDate) {
            // second part of pre-deflationary phase, constant 500 kas per second
            const secondsFirstTwoWeeks = (firstTwoWeeksEndDate - KASPA_GENESIS_DATE) / 1000;
            supply = 500 * secondsFirstTwoWeeks;
            const secondsSinceFirstTwoWeeks = (currentDate - firstTwoWeeksEndDate) / 1000;
            supply += 500 * secondsSinceFirstTwoWeeks;
        } else {
            const secondsFirstTwoWeeks = (firstTwoWeeksEndDate - KASPA_GENESIS_DATE) / 1000;
            supply = 500 * secondsFirstTwoWeeks;
            supply += 500 * preDeflationaryDuration;
            const secondsSinceChromaticStart = (currentDate - preDeflationaryEndDate) / 1000;
            let currentReward = 440;
            let totalSeconds = 0;

            while (totalSeconds < secondsSinceChromaticStart) {
                let secondsThisPeriod = Math.min(secondsInYear, secondsSinceChromaticStart - totalSeconds);
                supply += currentReward * secondsThisPeriod;
                currentReward *= Math.pow(0.5, 1 / 12);
                totalSeconds += secondsThisPeriod;
            }
        }

        return supply;
    };

    const updateKasOvertakePrice = (endDate, asset) => {
        const daysRange = (endDate - KASPA_GENESIS_DATE) / (1000 * 3600 * 24);
        return Array.from({ length: daysRange }, (_, i) => {
            const currentDate = new Date(KASPA_GENESIS_DATE.getTime() + i * 24 * 3600 * 1000);
            const assetSupply = asset === 'btc' ? calculateBitcoinSupply(currentDate) : null
            const kaspaSupply = calculateKaspaSupply(currentDate);
            return assetSupply / kaspaSupply + 1e-8;
        });
    };

    const performRegression = (parsedData, maxDays, minDays) => {
        const logData = parsedData.map(entry => [log(entry.daysSinceGenesis), log(entry.open)]);
        const result = regression.linear(logData);
        const predict = (daysSinceGenesis) => pow(result.predict(log(daysSinceGenesis))[1])

        const extendedRegressionData = Array.from({ length: maxDays + 1 - minDays }, (_, i) => {
            const days = i + minDays;
            const predictedOpen = predict(days);
            return {
                daysSinceGenesis: days,
                open: predictedOpen // Transform back to original scale
            };
        });

        return {
            model: result,
            predict: predict,
            regressionData: extendedRegressionData,
            r2: result.r2
        };
    };

    const estimateIntersection = (regressionResult, kasOvertakePrice, minDays, maxDays) => {
        const today = new Date();
        let intersectionDate = null;
        let daysSinceGenesis = minDays;
        let found = false;

        while (!found && daysSinceGenesis <= maxDays) {
            const futureDate = new Date(KASPA_GENESIS_DATE.getTime() + daysSinceGenesis * 24 * 3600 * 1000);
            const priceKasOvertakesAsset = kasOvertakePrice[daysSinceGenesis];

            const predictedPrice = regressionResult.predict(daysSinceGenesis);

            if (priceKasOvertakesAsset <= predictedPrice) {
                intersectionDate = futureDate;
                found = true;
            } else {
                daysSinceGenesis++;
            }
        }

        if (intersectionDate) {
            const years = (intersectionDate - today) / (1000 * 3600 * 24 * 365.25);
            const month = intersectionDate.toLocaleString('default', { month: 'long' });
            const year = intersectionDate.getFullYear();

            return `${month} ${year}, ${years.toFixed(1)} years from now`;
        } else {
            return "No intersection found within the available data range.";
        }
    };


    const fetchPrices = useCallback(async () => {
        try {
            const [historical_response, responseApi] = await Promise.all([
                fetch(`./data/kaspa_prices_${assetSelection}_historical.csv`),
                fetch(`./data/kaspa_prices_${assetSelection}_api.csv`)
            ]);

            const [historical_text, textApi] = await Promise.all([
                historical_response.text(),
                responseApi.text()
            ]);
            const historical_results = Papa.parse(historical_text, { header: true, skipEmptyLines: true });
            const api_results = Papa.parse(textApi, { header: true, skipEmptyLines: true });
            if (historical_results.data && historical_results.data.length > 0) {
                const parseData = (data) => data.map(entry => {
                    const date = new Date(entry['Start']);
                    const daysSinceGenesis = (date - KASPA_GENESIS_DATE) / (1000 * 3600 * 24);
                    return {
                        date,
                        daysSinceGenesis,
                        open: parseFloat(entry['Open'])
                    };
                }).filter(entry => !isNaN(entry.daysSinceGenesis) && !isNaN(entry.open));

                const historicalData = parseData(historical_results.data);
                const apiData = parseData(api_results.data);

                // Use a Map to merge data, preferring historicalData
                const dataMap = new Map();
                historicalData.forEach(entry => dataMap.set(entry.date.getTime(), entry));
                apiData.forEach(entry => {
                    if (!dataMap.has(entry.date.getTime())) {
                        dataMap.set(entry.date.getTime(), entry);
                    }
                });

                const parsedData = Array.from(dataMap.values()).sort((a, b) => a.date - b.date);

                const latestDate = new Date(Math.max(...parsedData.map(entry => entry.date)));
                setLastUpdated(latestDate.toLocaleDateString());
                const minDate = new Date(Math.min(...parsedData.map(entry => entry.date)));
                setMinDataDate(minDate.toLocaleDateString())

                const maxDays = Math.max(...parsedData.map(entry => entry.daysSinceGenesis)) + YEARS_OUT_PRICES * 360; // Extend by YEARS_OUT_PRICES years
                const minDays = Math.min(...parsedData.map(entry => entry.daysSinceGenesis));
                const regressionResult = performRegression(parsedData, maxDays, minDays);
                const kasOvertakePrice = updateKasOvertakePrice(new Date(KASPA_GENESIS_DATE.getTime() + maxDays * 24 * 3600 * 1000), assetSelection);
                const intersection = estimateIntersection(regressionResult, kasOvertakePrice, minDays, maxDays);

                setMonthTicks(generateMonthTicks("2022", new Date().getFullYear() + YEARS_OUT_PRICES, KASPA_GENESIS_DATE));

                const maxY = Math.max(...regressionResult.regressionData.map(entry => entry.open));
                const minY = Math.min(...regressionResult.regressionData.map(entry => entry.open));
                generateYTick(minY, maxY, assetSelection);


                setPlotData([
                    {
                        x: parsedData.map(entry => log(entry.daysSinceGenesis)),
                        y: parsedData.map(entry => log(entry.open)),
                        type: 'scatter',
                        mode: 'lines+markers',
                        name: 'Open Prices',
                        marker: { color: 'blue' },
                    },
                    {
                        x: regressionResult.regressionData.map(entry => log(entry.daysSinceGenesis)),
                        y: regressionResult.regressionData.map(entry => log(entry.open)),
                        type: 'scatter',
                        mode: 'lines',
                        name: 'Kaspa Best Fit Line',
                        line: { color: 'red' }
                    },
                    {
                        x: Array.from({ length: maxDays + 1 - minDays }, (_, i) => log(i + minDays)),
                        y: kasOvertakePrice.map(price => log(price)),
                        type: 'scatter',
                        mode: 'lines',
                        name: `Kas Overtake ${assetSelection.toUpperCase()} ${modeSelection}`,
                        line: { color: 'green', dash: 'dot' }
                    }
                ]);
                setIntersectionEstimate(intersection);
                setLoading(false);
                const title = `KAS/${assetSelection.toUpperCase()} PowerLaw and Price in ${assetSelection.toUpperCase()} needed for Kaspa to be worth more than ${assetSelection.toUpperCase()} log${logBaseSelection} scale)`
                setGraphTitle(title)
                setR2(regressionResult.r2)
            }
            else {
                console.error('No valid data available');
                setLoading(false);
            }
        } catch (error) {
            console.error('Error fetching or parsing data:', error);
            setLoading(false);
        }
    }, [assetSelection, logBaseSelection, modeSelection]);

    const fetchHashrate = useCallback(async () => {
        try {
            const [historical_response, responseApi, btcHistorical_response, btcApi_response] = await Promise.all([
                fetch(`./data/kaspa_hashrate_historical.csv`),
                fetch(`./data/kaspa_hashrate_api.csv`),
                fetch(`./data/bitcoin_hashrate_historical.csv`),
                fetch(`./data/bitcoin_hashrate_api.csv`)
            ]);

            const [kasHistoricalText, kasTextApi, btcHistorical_text, btcApi_text] = await Promise.all([
                historical_response.text(),
                responseApi.text(),
                btcHistorical_response.text(),
                btcApi_response.text()
            ]);

            const kaspaHistoricalResults = Papa.parse(kasHistoricalText, { header: true, skipEmptyLines: true });
            const kaspaApiResults = Papa.parse(kasTextApi, { header: true, skipEmptyLines: true });
            const btcHistorical_results = Papa.parse(btcHistorical_text, { header: true, skipEmptyLines: true });
            const btcApi_results = Papa.parse(btcApi_text, { header: true, skipEmptyLines: true });

            if (kaspaHistoricalResults.data && kaspaHistoricalResults.data.length > 0) {
                const parseData = (data, genesisDate) => data.map(entry => {
                    const date = new Date(entry['Start']);
                    const daysSinceGenesis = (date - genesisDate) / (1000 * 3600 * 24);
                    return {
                        date,
                        daysSinceGenesis,
                        open: parseFloat(entry['Open']) // Hashes / Second. May not actually be at open
                    };
                }).filter(entry => !isNaN(entry.daysSinceGenesis) && !isNaN(entry.open));

                const kaspaHistoricalData = parseData(kaspaHistoricalResults.data, KASPA_GENESIS_DATE);
                const kaspaApiData = parseData(kaspaApiResults.data, KASPA_GENESIS_DATE);
                const btcHistoricalData = parseData(btcHistorical_results.data, BITCOIN_GENESIS_DATE);
                const btcApiData = parseData(btcApi_results.data, BITCOIN_GENESIS_DATE);

                // Use a Map to merge data, preferring historicalData
                const dataMap = new Map();
                kaspaHistoricalData.forEach(entry => dataMap.set(entry.date.getTime(), entry));
                kaspaApiData.forEach(entry => {
                    if (!dataMap.has(entry.date.getTime())) {
                        dataMap.set(entry.date.getTime(), entry);
                    }
                });

                const parsedData = Array.from(dataMap.values()).sort((a, b) => a.date - b.date);

                const btcDataMap = new Map();
                btcHistoricalData.forEach(entry => btcDataMap.set(entry.date.getTime(), entry));
                btcApiData.forEach(entry => {
                    if (!btcDataMap.has(entry.date.getTime())) {
                        btcDataMap.set(entry.date.getTime(), entry);
                    }
                });

                const btcParsedData = Array.from(btcDataMap.values()).sort((a, b) => a.date - b.date);

                const latestDate = new Date(Math.max(...parsedData.map(entry => entry.date)));
                setLastUpdated(latestDate.toLocaleDateString());
                const minDate = new Date(Math.min(...parsedData.map(entry => entry.date)));
                setMinDataDate(minDate.toLocaleDateString())



                const today = new Date();
                const maxDays = Math.floor((today - KASPA_GENESIS_DATE) / (1000 * 3600 * 24)) + YEARS_OUT_HASHRATE * 360; // Extend by YEARS_OUT_HASHRATE years
                const maxDaysBTC = Math.floor((today - BITCOIN_GENESIS_DATE) / (1000 * 3600 * 24)) + YEARS_OUT_HASHRATE * 360; // Extend by YEARS_OUT_HASHRATE years
                const minDaysKaspa = Math.min(...parsedData.map(entry => entry.daysSinceGenesis));
                const minDaysBtc = Math.min(...btcParsedData.map(entry => entry.daysSinceGenesis));


                // Perform regression using the complete history
                const regressionResult = performRegression(parsedData, maxDays, minDaysKaspa);
                const btcRegressionResult = performRegression(btcParsedData, maxDaysBTC, minDaysBtc);

                const btcBestFitDataSinceKasGenesis = btcRegressionResult.regressionData.filter(entry => convertToDate(entry.daysSinceGenesis, BITCOIN_GENESIS_DATE) >= KASPA_GENESIS_DATE)
                const btcOriginalDataSinceKasGenesis = btcParsedData.filter(entry => convertToDate(entry.daysSinceGenesis, BITCOIN_GENESIS_DATE) >= KASPA_GENESIS_DATE)

                const intersection = estimateIntersection(regressionResult, btcBestFitDataSinceKasGenesis.map(entry => entry.open), minDaysKaspa, maxDays);

                setMonthTicks(generateMonthTicks("2022", new Date().getFullYear() + YEARS_OUT_HASHRATE, BITCOIN_GENESIS_DATE));
                const maxY = Math.max(...regressionResult.regressionData.map(entry => entry.open), ...btcRegressionResult.regressionData.map(entry => entry.open))
                const minY = Math.min(...regressionResult.regressionData.map(entry => entry.open), ...btcRegressionResult.regressionData.map(entry => entry.open))
                generateYTick(minY, maxY, "H/s");


                setPlotData([
                    {
                        x: parsedData.map(entry => log(daysSinceGenesis(convertToDate(entry.daysSinceGenesis, KASPA_GENESIS_DATE), BITCOIN_GENESIS_DATE))), // Adjust x-axis to start from Kaspa genesis
                        y: parsedData.map(entry => log(entry.open)),
                        type: 'scatter',
                        mode: 'lines+markers',
                        name: 'Kaspa Hashrate (H/s)',
                        marker: { color: 'blue' },
                    },
                    {
                        x: regressionResult.regressionData.map(entry => log(daysSinceGenesis(convertToDate(entry.daysSinceGenesis, KASPA_GENESIS_DATE), BITCOIN_GENESIS_DATE))), // Adjust x-axis to start from Kaspa genesis
                        y: regressionResult.regressionData.map(entry => log(entry.open)),
                        type: 'scatter',
                        mode: 'lines',
                        name: 'Kaspa Best Fit Line',
                        line: { color: 'red' }
                    },
                    {
                        x: btcBestFitDataSinceKasGenesis.map(entry => log(entry.daysSinceGenesis)),
                        y: btcBestFitDataSinceKasGenesis.map(entry => log(entry.open)), // No filter needed for y values
                        type: 'scatter',
                        mode: 'lines+markers',
                        name: 'BTC Best Fit Line',
                        marker: { color: 'green' },
                    },
                    {
                        x: btcOriginalDataSinceKasGenesis.map(entry => log(entry.daysSinceGenesis)),
                        y: btcOriginalDataSinceKasGenesis.map(entry => log(entry.open)),
                        type: 'scatter',
                        mode: 'lines',
                        name: 'BTC Hashrate (H/s)',
                        line: { color: 'green', dash: 'dot' }
                    }
                ]);

                setIntersectionEstimate(intersection);
                const title = `KAS and ${assetSelection.toUpperCase()} PowerLaw and Hashrate, and timeline to intersect using log ${logBaseSelection}.`
                setGraphTitle(title)
                setR2(regressionResult.r2)
                setBtcR2(btcRegressionResult.r2);

                setLoading(false);
            } else {
                console.error('No valid data available');
                setLoading(false);
            }
        } catch (error) {
            console.error('Error fetching or parsing data:', error);
            setLoading(false);
        }
    }, [assetSelection, logBaseSelection, modeSelection]);


    useEffect(() => {
        if (modeSelection === 'prices') {
            fetchPrices();
        } else if (modeSelection === 'hashrate') {
            fetchHashrate();
        }
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [assetSelection, modeSelection, logBaseSelection, fetchHashrate, fetchPrices]);


    const plotLayout = {
        width: windowWidth > 600 ? 920 : windowWidth - 40,
        height: windowWidth > 600 ? 440 : 300,
        title: graphTitle,
        xaxis: {
            type: 'linear',
            autorange: true,
            tickvals: monthTicks.map(tick => log(tick.value)),
            ticktext: monthTicks.map(tick => tick.label),
            tickfont: {
                size: windowWidth > 600 ? 8 : 6,
                family: 'Arial, sans-serif',
                color: '#7f7f7f'
            },
            tickangle: 45,
            title: modeSelection === 'prices' ? 'Days Since Kaspa Genesis' : 'Truncated Days Since Bitcoin Genesis',
        },
        yaxis: {
            title: `Kas ${modeSelection === 'prices' ? 'Price' : 'Hashrate'} in ${assetSelection.toUpperCase()}`,
            type: 'linear',
            autorange: true,
            tickvals: yAxisTicks.tickvals,
            ticktext: yAxisTicks.ticktext,
            tickfont: {
                size: windowWidth > 600 ? 8 : 6, // Adjust text size for better readability
                family: 'Arial, sans-serif',
                color: '#7f7f7f'
            }
        },
        margin: { l: 50, r: 50, t: 50, b: 50 },
        paper_bgcolor: '#f4f4f4',
        plot_bgcolor: '#f4f4f4'
    };
    const titleStyle = {
        color: '#FFFFFF',
        padding: '20px 40px',
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        fontSize: windowWidth > 600 ? '28px' : '24px',
        marginTop: '20px',
        borderRadius: '10px',
    };

    const buttonStyle = {
        backgroundColor: '#4CAF50', /* Green */
        border: 'none',
        color: 'white',
        padding: '15px 30px',
        textAlign: 'center',
        textDecoration: 'none',
        display: 'block', // Center button
        fontSize: windowWidth > 600 ? '18px' : '14px',
        margin: '20px auto', // Center button
        cursor: 'pointer',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
        transition: 'background-color 0.3s, box-shadow 0.3s',
    };

    const containerStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px',
    };

    const warningBoxStyle = {
        backgroundColor: '#FFF3CD',
        color: '#856404',
        border: '1px solid #FFEEBA',
        borderRadius: '5px',
        padding: '10px 20px',
        margin: '20px 0',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
    };

    // Effect to update plot data with detailed hover text after initial render
    useEffect(() => {
        if (plotData && plotData.length > 0) {
            // Generate hover text for each data point
            const generateHoverText = (xData, yData, genesisDate, assetSelection) => {
                return yData.map((yValue, index) => {
                    const date = convertToDate(pow(xData[index]), genesisDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });;

                    // Find the original y-value from yAxisTicks
                    const originalYValue = pow(yValue).toExponential(2); // Convert to exponential form with 2 decimal places

                    return `Date: ${date}<br>Kas ${modeSelection === 'prices' ? 'Price' : 'Hashrate'} in ${assetSelection.toUpperCase()}: ${originalYValue}`;
                });
            };
            // Update plot data with hover text
            // TODO - this slows down website performace. Fix this
            const updatedPlotData = plotData.map(trace => ({
                ...trace,
                hovertemplate: generateHoverText(trace.x, trace.y, modeSelection === 'prices' ? KASPA_GENESIS_DATE : BITCOIN_GENESIS_DATE, modeSelection === 'prices' ? assetSelection.toUpperCase() : 'H/s')
            }));

            setPlotDataWithHighlights(updatedPlotData);
        }
    }, [plotData, modeSelection, assetSelection]);


    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <img src="/images/kaspa_pacman.gif" alt="Kaspa Pacman Animation" style={{ maxWidth: '300px' }} />
            <div>Loading...</div>
        </div>;
    }


    return (
        <div style={containerStyle}>
            {modeSelection === 'hashrate' && (
                <div style={warningBoxStyle}>
                    <strong>Warning:</strong> We only have kaspa hashrate data starting from {minDataDate}. More time is needed for this estimate to have enough data
                </div>
            )}
            <div style={titleStyle} id="title">
                <h3 id="title_template">
                    Kaspa Will Overtake {assetSelection.toUpperCase()} in {modeSelection === 'prices' ? 'Market Cap' : 'Hashrate'} around
                </h3>
                <h1 id="title_date">{intersectionEstimate.split(',')[0]}</h1>
                <h2 id="title_duration">{intersectionEstimate.split(',')[1]}</h2>
                <h4 id="title_r2">
                    {modeSelection === 'hashrate'
                        ? `R²: Kaspa ${r2?.toFixed(2)}, BTC ${btcR2?.toFixed(2)}`
                        : `R²: ${r2?.toFixed(2)}`
                    }
                </h4>
            </div>
            <div style={{ textAlign: 'center', padding: '20px', width: '100%' }}>
                <div style={{ marginBottom: '20px' }}>
                    <label htmlFor="logBaseSelect" style={{ marginRight: '10px' }}>Select Logarithm Base:</label>
                    <select
                        id="logBaseSelect"
                        value={logBaseSelection}
                        onChange={(e) => setLogBaseSelection(e.target.value)}
                        style={{ padding: '5px', fontSize: '16px' }}
                    >
                        <option value="2">log base 2</option>
                        <option value="10">log base 10</option>
                        <option value="e">log base e</option>
                    </select>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <label htmlFor="assetSelect" style={{ marginRight: '10px' }}>Select Asset To Overtake:</label>
                    <select
                        id="assetSelect"
                        value={assetSelection}
                        onChange={(e) => setAssetSelection(e.target.value)}
                        style={{ padding: '5px', fontSize: '16px' }}
                    >
                        <option value="btc">BTC</option>
                    </select>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <label htmlFor="modeSelect" style={{ marginRight: '10px' }}>Select Mode:</label>
                    <select
                        id="modeSelect"
                        value={modeSelection}
                        onChange={(e) => setModeSelection(e.target.value)}
                        style={{ padding: '5px', fontSize: '16px' }}
                    >
                        <option value="hashrate">Hashrate</option>
                        <option value="prices">Prices</option>

                    </select>
                </div>
                <Plot
                    data={plotDataWithHighlights || plotData}
                    layout={plotLayout}
                    config={{ responsive: true }}
                />

                <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
                    Last Updated: {lastUpdated}
                </div>

                <button style={buttonStyle} onClick={() => setIsResourcesOpen(!isResourcesOpen)}>Toggle Resources</button>
                <Collapse isOpened={isResourcesOpen}>
                    <div>
                        <img src="/images/kaspa_pacman.gif" alt="Kaspa Pacman Animation" style={{ display: 'block', margin: 'auto', maxWidth: '400px' }} />
                        <p>Thank you BTC_POWER_LAW / PlanG for the powerlaw and resources <a href="https://x.com/Giovann35084111/status/1757205787083251814">twitter link</a></p>
                        <p>Thank you Plan𐤊 for finding kas/btc has a powerlaw <a href="https://x.com/MikoGenno/status/1757498808668237845"> twitter link</a></p>
                        <p>Also visit <a href="https://www.kaspainsights.com/">https://www.kaspainsights.com/</a> and <a href="kas.fyi">kas.fyi</a> for another powerlaw graph and more insights for kaspa</p>
                        <p>Github for this project is at <a href="https://github.com/whenkas/whenkas.github.io">github</a></p>
                    </div>
                </Collapse>
            </div>
        </div>
    );
};

export default KaspaPriceChart;
