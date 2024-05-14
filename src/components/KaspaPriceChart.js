import React, { useEffect, useState } from 'react';
import Plotly from 'plotly.js-basic-dist';
import createPlotlyComponent from 'react-plotly.js/factory';
import Papa from 'papaparse';
import regression from 'regression';
import { Collapse } from 'react-collapse';

const Plot = createPlotlyComponent(Plotly);

const BITCOIN_HALVING_INTERVAL = 210000; // Blocks per halving
const BITCOIN_GENESIS_DATE = new Date('2009-01-03');
const GENESIS_DATE = new Date('2021-11-07');
const YEARS_OUT = 10;

const KaspaPriceChart = () => {
    const [plotData, setPlotData] = useState([]);
    const [intersectionEstimate, setIntersectionEstimate] = useState('');
    const [rSquared, setRSquared] = useState(null);
    const [monthTicks, setMonthTicks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isResourcesOpen, setIsResourcesOpen] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);



    useEffect(() => {
        fetchData();
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);

    });

    const daysSinceGenesis = (date) => {
        return Math.floor((date - GENESIS_DATE) / (1000 * 60 * 60 * 24));
    };

    const generateMonthTicks = (startYear, endYear) => {
        const ticks = [];
        for (let year = startYear; year <= endYear; year++) {
            [0, 6].forEach(month => {
                const date = new Date(year, month, 1);
                ticks.push({
                    value: daysSinceGenesis(date),
                    label: `${date.toLocaleString('default', { month: 'short' })} ${year}`
                });
            });
        }
        return ticks;
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
        const secondsInYear = 365.25 * 24 * 60 * 60;
        const preDeflationaryDuration = (preDeflationaryEndDate - GENESIS_DATE) / 1000;
        let supply = 0;

        if (currentDate <= preDeflationaryEndDate) {
            const secondsSinceStart = (currentDate - GENESIS_DATE) / 1000;
            supply = 500 * secondsSinceStart;
        } else {
            supply = 500 * preDeflationaryDuration;
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

    const updateKasOvertakeBTCPrice = (endDate) => {
        const daysRange = (endDate - GENESIS_DATE) / (1000 * 3600 * 24);
        return Array.from({ length: daysRange }, (_, i) => {
            const currentDate = new Date(GENESIS_DATE.getTime() + i * 24 * 3600 * 1000);
            const btcSupply = calculateBitcoinSupply(currentDate);
            const kaspaSupply = calculateKaspaSupply(currentDate);
            return btcSupply / kaspaSupply + 1e-8;
        });
    };

    const performRegression = (parsedData, maxDays, minDays) => {
        const logData = parsedData.map(entry => [Math.log(entry.daysSinceGenesis), Math.log(entry.open)]);
        const result = regression.linear(logData);
        const extendedRegressionData = Array.from({ length: maxDays + 1 - minDays }, (_, i) => {
            const days = i + minDays;
            const predictedLogOpen = result.predict(Math.log(days))[1];
            return {
                daysSinceGenesis: days,
                open: Math.exp(predictedLogOpen)
            };
        });
        return {
            model: result,
            regressionData: extendedRegressionData,
            r2: result.r2
        };
    };

    const estimateIntersection = (regressionResult, kasOvertakeBTCPrice, minDays, maxDays) => {
        const today = new Date();
        let intersectionDate = null;
        let daysSinceGenesis = minDays;
        let found = false;

        while (!found && daysSinceGenesis <= maxDays) {
            const futureDate = new Date(GENESIS_DATE.getTime() + daysSinceGenesis * 24 * 3600 * 1000);
            const priceKasOvertakesBtc = kasOvertakeBTCPrice[daysSinceGenesis];

            const predictedPrice = Math.exp(regressionResult.model.predict(Math.log(daysSinceGenesis))[1]);

            if (priceKasOvertakesBtc <= predictedPrice) {
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

    const fetchData = async () => {
        try {
            const [historical_response, responseApi] = await Promise.all([
                fetch('./data/kaspa_prices_btc_historical.csv'),
                fetch('./data/kaspa_prices_btc_historical.csv')
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
                    const daysSinceGenesis = (date - GENESIS_DATE) / (1000 * 3600 * 24);
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

                const maxDays = Math.max(...parsedData.map(entry => entry.daysSinceGenesis)) + YEARS_OUT * 360; // Extend by 10 years
                const minDays = Math.min(...parsedData.map(entry => entry.daysSinceGenesis));
                const regressionResult = performRegression(parsedData, maxDays, minDays);
                const kasOvertakeBTCPrice = updateKasOvertakeBTCPrice(new Date(GENESIS_DATE.getTime() + maxDays * 24 * 3600 * 1000));
                const intersection = estimateIntersection(regressionResult, kasOvertakeBTCPrice, minDays, maxDays);

                setMonthTicks(generateMonthTicks("2022", new Date().getFullYear() + YEARS_OUT));

                setPlotData([
                    {
                        x: parsedData.map(entry => entry.daysSinceGenesis),
                        y: parsedData.map(entry => entry.open),
                        type: 'scatter',
                        mode: 'lines+markers',
                        name: 'Open Prices',
                        marker: { color: 'blue' },
                    },
                    {
                        x: regressionResult.regressionData.map(entry => entry.daysSinceGenesis),
                        y: regressionResult.regressionData.map(entry => entry.open),
                        type: 'scatter',
                        mode: 'lines',
                        name: 'Kaspa Best Fit Line',
                        line: { color: 'red' }
                    },
                    {
                        x: Array.from({ length: maxDays + 1 - minDays }, (_, i) => i + minDays),
                        y: kasOvertakeBTCPrice,
                        type: 'scatter',
                        mode: 'lines',
                        name: 'Kas Overtake BTC Price',
                        line: { color: 'green', dash: 'dot' }
                    }
                ]);
                setIntersectionEstimate(intersection);
                setRSquared(regressionResult.r2);
                setLoading(false);
            }
            else {
                console.error('No valid data available');
                setLoading(false);
            }
        } catch (error) {
            console.error('Error fetching or parsing data:', error);
            setLoading(false);
        }
    };

    const plotLayout = {
        width: windowWidth > 600 ? 920 : windowWidth - 40,
        height: windowWidth > 600 ? 440 : 300,
        title: `KAS/BTC PowerLaw and Kaspa Price in BTC needed to be worth more then BTC log scale (r²=${rSquared?.toFixed(4)})`,
        xaxis: {
            type: 'log',
            autorange: true,
            tickvals: monthTicks.map(tick => tick.value),
            ticktext: monthTicks.map(tick => tick.label),
            tickfont: {
                size: windowWidth > 600 ? 8 : 6,
                family: 'Arial, sans-serif',
                color: '#7f7f7f'
            },
            tickangle: 45,
        },
        yaxis: {
            title: 'Kas Price in BTC (log scale)',
            type: 'log',
            autorange: true,
            tickformat: '.0e',
            exponentformat: 'e'
        },
        margin: { l: 50, r: 50, t: 50, b: 50 },
        paper_bgcolor: '#f4f4f4',
        plot_bgcolor: '#f4f4f4',
    };

    const titleStyle = {
        color: '#FFFFFF',
        padding: '20px',
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        fontSize: windowWidth > 600 ? '28px' : '20px',
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

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <img src="/images/kaspa_pacman.gif" alt="Kaspa Pacman Animation" style={{ maxWidth: '300px' }} />
            <div>Loading...</div>
        </div>;
    }

    return (
        <div style={containerStyle}>
            <div style={titleStyle}>
                <h3>Kaspa Will Overtake Bitcoin around</h3>
                <h1>{intersectionEstimate.split(',')[0]}</h1>
                <h2>{intersectionEstimate.split(',')[1]}</h2>
            </div>
            <div style={{ textAlign: 'center', padding: '20px' }}>
                <Plot
                    data={plotData}
                    layout={plotLayout}
                />
                <button style={buttonStyle} onClick={() => setIsResourcesOpen(!isResourcesOpen)}>Toggle Resources</button>
                <Collapse isOpened={isResourcesOpen}>
                    <div>
                        <img src="/images/kaspa_pacman.gif" alt="Kaspa Pacman Animation" style={{ display: 'block', margin: 'auto', maxWidth: '400px' }} />
                        <p>Thank you BTC_POWER_LAW / PlanG for the powerlaw and resources <a href="https://x.com/Giovann35084111/status/1757205787083251814">twitter link</a></p>
                        <p>Thank you Plan𐤊 for finding kas/btc has a powerlaw <a href="https://x.com/MikoGenno/status/1757498808668237845"> twitter link</a></p>
                        <p>Also visit <a href="https://kasping.streamlit.app/">https://kasping.streamlit.app/</a> for more powerlaw graphs for kaspa</p>
                        <p>Github for this project is at <a href="https://github.com/whenkas/whenkas.github.io">github</a></p>
                    </div>
                </Collapse>
            </div>
        </div>
    );
};

export default KaspaPriceChart;       