# OpenChart JS

OpenChart JS is a Node.js library for downloading intraday and EOD (End of Day) historical data from the NSE (National Stock Exchange of India) and NFO (NSE Futures and Options) exchanges.

## Installation

You can install the library using npm:

```bash
npm install openchart-js
```

## Usage

### Import the Library

```javascript
const NSEData = require('openchart-js');
```

### Initialize the NSEData Class

```javascript
const nse = new NSEData();
```

### Download Master Data

Before fetching historical data or searching for symbols, download the master data:

```javascript
await nse.download();
```

### Fetch Historical Data

To fetch historical data for a symbol, use the `historical` method. **Always specify `start` and `end` dates**. You can use `moment` to get data from 30 days back.

#### Intraday Data

Fetch intraday data for **TCS** with a 5-minute interval, from 30 days ago until today:

```javascript
const moment = require('moment');

const endDate = moment();
const startDate = moment().subtract(30, 'days');

const data = await nse.historical(
    'TCS',
    'NSE',
    startDate.toDate(),
    endDate.toDate(),
    '5m'
);
console.log(data);
```

#### EOD Data

Fetch end-of-day data for **Nifty 50**, from 365 days ago until today:

```javascript
const moment = require('moment');

const endDate = moment();
const startDate = moment().subtract(365, 'days');

const data = await nse.historical(
    'Nifty 50',
    'NSE',
    startDate.toDate(),
    endDate.toDate(),
    '1d'
);
console.log(data);
```

#### NFO Data

Fetch historical data for a futures contract of 15min data, from 30 days ago until today:

```javascript
const moment = require('moment');

const endDate = moment();
const startDate = moment().subtract(30, 'days');

const data = await nse.historical(
    'BANKNIFTY24OCTFUT',
    'NFO',
    startDate.toDate(),
    endDate.toDate(),
    '15m'
);
console.log(data);
```

### Search for Symbols

#### NSE Exchange

Search for symbols like **Nifty 50**, **TCS**, **RELIANCE** in the NSE exchange.

```javascript
const symbols = nse.search('RELIANCE', 'NSE');
console.log(symbols);
```

#### NFO Exchange

Search for symbols like **NIFTY24OCTFUT**, **BANKNIFTY24OCTFUT**, **NIFTY24N2124800CE**, **NIFTY24N2124800PE** in the NFO exchange.

```javascript
const symbols = nse.search('BANKNIFTY24OCT', 'NFO');
console.log(symbols);
```

#### Exact Match Search

If you want to perform an exact match search, you can set `exactMatch` to `true`.

```javascript
const symbolInfo = nse.search('BANKNIFTY24OCTFUT', 'NFO', true);
console.log(symbolInfo);
```

### Supported Timeframes

```javascript
console.log(nse.timeframes());
// Output: ['1m', '3m', '5m', '10m', '15m', '30m', '1h', '1d', '1w', '1M']
```

## Methods

- `download()`: Downloads NSE and NFO master data.
- `search(symbol, exchange, exactMatch = false)`: Searches for symbols in the specified exchange (`'NSE'` or `'NFO'`).
  - Returns an array containing all matching symbols.
- `symbolsearch(symbol, exchange)`: Searches for a symbol and returns the first match.
  - Used internally by the `historical` method.
- `historical(symbol, exchange, start, end, interval = '1d')`: Fetches historical data for a symbol.
  - Uses the `symbolsearch` method to find the symbol, which returns the first match.
  - **Always specify `start` and `end` dates when fetching data**.
- `timeframes()`: Returns an array of supported timeframes.

## Notes

- Ensure that you have a stable internet connection as the library fetches data from NSE servers.
- The `historical` method uses `symbolsearch`, which returns the first matching symbol. If multiple symbols match your query, consider using an exact symbol name or modifying the `historical` method to accept a symbol code directly.
- **When fetching historical data, always specify `start` and `end` dates. You can use `moment` to calculate these dates.**

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.