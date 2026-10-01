var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};

// src/lib/db.ts
var import_client = require("@prisma/client");
var globalForPrisma = globalThis;
var db = globalForPrisma.prisma ?? new import_client.PrismaClient({
  log: ["query"]
});
if (true)
  globalForPrisma.prisma = db;

// node_modules/z-ai-web-dev-sdk/dist/index.js
var import_promises = __toESM(require("fs/promises"));
var import_path = __toESM(require("path"));
var import_os = __toESM(require("os"));
var loadConfig = async () => {
  const homeDir = import_os.default.homedir();
  const configPaths = [
    import_path.default.join(process.cwd(), ".z-ai-config"),
    import_path.default.join(homeDir, ".z-ai-config"),
    "/etc/.z-ai-config"
  ];
  for (const filePath of configPaths) {
    try {
      const configStr = await import_promises.default.readFile(filePath, "utf-8");
      const config = JSON.parse(configStr);
      if (config.baseUrl && config.apiKey) {
        return config;
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error(`Error reading or parsing config file at ${filePath}:`, error);
      }
    }
  }
  throw new Error("Configuration file not found or invalid. Please create .z-ai-config in your project, home directory, or /etc.");
};

class ZAI {
  constructor(config) {
    this.config = config;
    this.chat = {
      completions: {
        create: this.createChatCompletion.bind(this),
        createVision: this.createChatCompletionVision.bind(this)
      }
    };
    this.audio = {
      tts: {
        create: this.createAudioTTS.bind(this)
      },
      asr: {
        create: this.createAudioASR.bind(this)
      }
    };
    this.images = {
      generations: {
        create: this.createImageGeneration.bind(this),
        edit: this.createImageEdit.bind(this)
      },
      search: {
        create: this.createImageSearch.bind(this)
      }
    };
    this.video = {
      generations: {
        create: this.createVideoGeneration.bind(this)
      }
    };
    this.async = {
      result: {
        query: this.queryAsyncResult.bind(this)
      }
    };
    this.functions = {
      invoke: this.invokeFunction.bind(this)
    };
  }
  static async create() {
    const config = await loadConfig();
    return new ZAI(config);
  }
  async createChatCompletion(body) {
    const { baseUrl, chatId, userId, apiKey, token } = this.config;
    const url = `${baseUrl}/chat/completions`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Z-AI-From": "Z"
    };
    if (chatId) {
      headers["X-Chat-Id"] = chatId;
    }
    if (userId) {
      headers["X-User-Id"] = userId;
    }
    if (token) {
      headers["X-Token"] = token;
    }
    const requestBody = {
      ...body,
      thinking: body.thinking || { type: "disabled" }
    };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (requestBody.stream && (contentType.includes("text/event-stream") || contentType.includes("text/plain"))) {
        return response.body;
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to make API request:", error);
      throw error;
    }
  }
  async createChatCompletionVision(body) {
    const { baseUrl, chatId, userId, apiKey, token } = this.config;
    const url = `${baseUrl}/chat/completions/vision`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Z-AI-From": "Z"
    };
    if (chatId) {
      headers["X-Chat-Id"] = chatId;
    }
    if (userId) {
      headers["X-User-Id"] = userId;
    }
    if (token) {
      headers["X-Token"] = token;
    }
    const requestBody = {
      ...body,
      thinking: body.thinking || { type: "disabled" }
    };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (requestBody.stream && (contentType.includes("text/event-stream") || contentType.includes("text/plain"))) {
        return response.body;
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to make vision API request:", error);
      throw error;
    }
  }
  async createAudioTTS(body) {
    const { baseUrl, chatId, userId, apiKey, token } = this.config;
    const url = `${baseUrl}/audio/tts`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Z-AI-From": "Z"
    };
    if (chatId) {
      headers["X-Chat-Id"] = chatId;
    }
    if (userId) {
      headers["X-User-Id"] = userId;
    }
    if (token) {
      headers["X-Token"] = token;
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
      }
      return response;
    } catch (error) {
      console.error("Failed to make TTS API request:", error);
      throw error;
    }
  }
  async createAudioASR(body) {
    const { baseUrl, chatId, userId, apiKey, token } = this.config;
    const url = `${baseUrl}/audio/asr`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Z-AI-From": "Z"
    };
    if (chatId) {
      headers["X-Chat-Id"] = chatId;
    }
    if (userId) {
      headers["X-User-Id"] = userId;
    }
    if (token) {
      headers["X-Token"] = token;
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to make ASR API request:", error);
      throw error;
    }
  }
  async createImageGeneration(body) {
    const { baseUrl, apiKey, chatId, userId, token } = this.config;
    const url = `${baseUrl}/images/generations`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Z-AI-From": "Z"
    };
    if (chatId) {
      headers["X-Chat-Id"] = chatId;
    }
    if (userId) {
      headers["X-User-Id"] = userId;
    }
    if (token) {
      headers["X-Token"] = token;
    }
    const requestBody = { ...body };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
      }
      const result = await response.json();
      const processedData = await Promise.all(result.data.map(async (item) => {
        if (item.url) {
          const base64 = await this.downloadImageAsBase64(item.url);
          return { base64, format: "png" };
        }
        return item;
      }));
      return {
        ...result,
        data: processedData
      };
    } catch (error) {
      console.error("Failed to make image generation request:", error);
      throw error;
    }
  }
  async createImageEdit(body) {
    const { baseUrl, apiKey, chatId, userId, token } = this.config;
    const url = `${baseUrl}/images/generations/edit`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Z-AI-From": "Z"
    };
    if (chatId) {
      headers["X-Chat-Id"] = chatId;
    }
    if (userId) {
      headers["X-User-Id"] = userId;
    }
    if (token) {
      headers["X-Token"] = token;
    }
    const requestBody = { ...body };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
      }
      const result = await response.json();
      const processedData = await Promise.all(result.data.map(async (item) => {
        if (item.url) {
          const base64 = await this.downloadImageAsBase64(item.url);
          return { base64, format: "png" };
        }
        return item;
      }));
      return {
        ...result,
        data: processedData
      };
    } catch (error) {
      console.error("Failed to make image edit request:", error);
      throw error;
    }
  }
  async createImageSearch(body) {
    const { baseUrl, apiKey, chatId, userId, token } = this.config;
    const url = `${baseUrl}/images/search`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Z-AI-From": "Z"
    };
    if (chatId) {
      headers["X-Chat-Id"] = chatId;
    }
    if (userId) {
      headers["X-User-Id"] = userId;
    }
    if (token) {
      headers["X-Token"] = token;
    }
    if (!body.query || !body.query.trim()) {
      throw new Error("image search requires a non-empty `query`");
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to make image search request:", error);
      throw error;
    }
  }
  async downloadImageAsBase64(imageUrl) {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");
      return `${base64}`;
    } catch (error) {
      console.error("Failed to download and convert image to base64:", error);
      throw error;
    }
  }
  async createVideoGeneration(body) {
    const { baseUrl, apiKey, chatId, userId, token } = this.config;
    const url = `${baseUrl}/video/generation`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Z-AI-From": "Z"
    };
    if (chatId) {
      headers["X-Chat-Id"] = chatId;
    }
    if (userId) {
      headers["X-User-Id"] = userId;
    }
    if (token) {
      headers["X-Token"] = token;
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to make video generation request:", error);
      throw error;
    }
  }
  async queryAsyncResult(taskId) {
    const { baseUrl, apiKey, chatId, userId, token } = this.config;
    const url = `${baseUrl}/async-result?id=${encodeURIComponent(taskId)}`;
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "X-Z-AI-From": "Z"
    };
    if (chatId) {
      headers["X-Chat-Id"] = chatId;
    }
    if (userId) {
      headers["X-User-Id"] = userId;
    }
    if (token) {
      headers["X-Token"] = token;
    }
    try {
      const response = await fetch(url, {
        method: "GET",
        headers
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to query async result:", error);
      throw error;
    }
  }
  async invokeFunction(function_name, args) {
    const { baseUrl, apiKey, chatId, userId, token } = this.config;
    const url = `${baseUrl}/functions/invoke`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Z-AI-From": "Z"
    };
    if (chatId) {
      headers["X-Chat-Id"] = chatId;
    }
    if (userId) {
      headers["X-User-Id"] = userId;
    }
    if (token) {
      headers["X-Token"] = token;
    }
    const body = {
      function_name,
      arguments: args
    };
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Function invoke failed with status ${response.status}: ${errorBody}`);
      }
      const result = await response.json();
      return result.result;
    } catch (error) {
      console.error("Failed to invoke remote function:", error);
      throw error;
    }
  }
}
var dist_default = ZAI;

// scripts/build-rss-ozet.ts
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"));

// node_modules/date-fns/constants.js
var daysInYear = 365.2425;
var maxTime = Math.pow(10, 8) * 24 * 60 * 60 * 1000;
var minTime = -maxTime;
var millisecondsInWeek = 604800000;
var millisecondsInDay = 86400000;
var secondsInHour = 3600;
var secondsInDay = secondsInHour * 24;
var secondsInWeek = secondsInDay * 7;
var secondsInYear = secondsInDay * daysInYear;
var secondsInMonth = secondsInYear / 12;
var secondsInQuarter = secondsInMonth * 3;
var constructFromSymbol = Symbol.for("constructDateFrom");

// node_modules/date-fns/constructFrom.js
function constructFrom(date, value) {
  if (typeof date === "function")
    return date(value);
  if (date && typeof date === "object" && constructFromSymbol in date)
    return date[constructFromSymbol](value);
  if (date instanceof Date)
    return new date.constructor(value);
  return new Date(value);
}

// node_modules/date-fns/toDate.js
function toDate(argument, context) {
  return constructFrom(context || argument, argument);
}

// node_modules/date-fns/_lib/defaultOptions.js
var defaultOptions = {};
function getDefaultOptions() {
  return defaultOptions;
}

// node_modules/date-fns/startOfWeek.js
function startOfWeek(date, options) {
  const defaultOptions2 = getDefaultOptions();
  const weekStartsOn = options?.weekStartsOn ?? options?.locale?.options?.weekStartsOn ?? defaultOptions2.weekStartsOn ?? defaultOptions2.locale?.options?.weekStartsOn ?? 0;
  const _date = toDate(date, options?.in);
  const day = _date.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  _date.setDate(_date.getDate() - diff);
  _date.setHours(0, 0, 0, 0);
  return _date;
}

// node_modules/date-fns/startOfISOWeek.js
function startOfISOWeek(date, options) {
  return startOfWeek(date, { ...options, weekStartsOn: 1 });
}

// node_modules/date-fns/getISOWeekYear.js
function getISOWeekYear(date, options) {
  const _date = toDate(date, options?.in);
  const year = _date.getFullYear();
  const fourthOfJanuaryOfNextYear = constructFrom(_date, 0);
  fourthOfJanuaryOfNextYear.setFullYear(year + 1, 0, 4);
  fourthOfJanuaryOfNextYear.setHours(0, 0, 0, 0);
  const startOfNextYear = startOfISOWeek(fourthOfJanuaryOfNextYear);
  const fourthOfJanuaryOfThisYear = constructFrom(_date, 0);
  fourthOfJanuaryOfThisYear.setFullYear(year, 0, 4);
  fourthOfJanuaryOfThisYear.setHours(0, 0, 0, 0);
  const startOfThisYear = startOfISOWeek(fourthOfJanuaryOfThisYear);
  if (_date.getTime() >= startOfNextYear.getTime()) {
    return year + 1;
  } else if (_date.getTime() >= startOfThisYear.getTime()) {
    return year;
  } else {
    return year - 1;
  }
}

// node_modules/date-fns/_lib/getTimezoneOffsetInMilliseconds.js
function getTimezoneOffsetInMilliseconds(date) {
  const _date = toDate(date);
  const utcDate = new Date(Date.UTC(_date.getFullYear(), _date.getMonth(), _date.getDate(), _date.getHours(), _date.getMinutes(), _date.getSeconds(), _date.getMilliseconds()));
  utcDate.setUTCFullYear(_date.getFullYear());
  return +date - +utcDate;
}

// node_modules/date-fns/_lib/normalizeDates.js
function normalizeDates(context, ...dates) {
  const normalize = constructFrom.bind(null, context || dates.find((date) => typeof date === "object"));
  return dates.map(normalize);
}

// node_modules/date-fns/startOfDay.js
function startOfDay(date, options) {
  const _date = toDate(date, options?.in);
  _date.setHours(0, 0, 0, 0);
  return _date;
}

// node_modules/date-fns/differenceInCalendarDays.js
function differenceInCalendarDays(laterDate, earlierDate, options) {
  const [laterDate_, earlierDate_] = normalizeDates(options?.in, laterDate, earlierDate);
  const laterStartOfDay = startOfDay(laterDate_);
  const earlierStartOfDay = startOfDay(earlierDate_);
  const laterTimestamp = +laterStartOfDay - getTimezoneOffsetInMilliseconds(laterStartOfDay);
  const earlierTimestamp = +earlierStartOfDay - getTimezoneOffsetInMilliseconds(earlierStartOfDay);
  return Math.round((laterTimestamp - earlierTimestamp) / millisecondsInDay);
}

// node_modules/date-fns/startOfISOWeekYear.js
function startOfISOWeekYear(date, options) {
  const year = getISOWeekYear(date, options);
  const fourthOfJanuary = constructFrom(options?.in || date, 0);
  fourthOfJanuary.setFullYear(year, 0, 4);
  fourthOfJanuary.setHours(0, 0, 0, 0);
  return startOfISOWeek(fourthOfJanuary);
}

// node_modules/date-fns/isDate.js
function isDate(value) {
  return value instanceof Date || typeof value === "object" && Object.prototype.toString.call(value) === "[object Date]";
}

// node_modules/date-fns/isValid.js
function isValid(date) {
  return !(!isDate(date) && typeof date !== "number" || isNaN(+toDate(date)));
}

// node_modules/date-fns/startOfYear.js
function startOfYear(date, options) {
  const date_ = toDate(date, options?.in);
  date_.setFullYear(date_.getFullYear(), 0, 1);
  date_.setHours(0, 0, 0, 0);
  return date_;
}

// node_modules/date-fns/locale/en-US/_lib/formatDistance.js
var formatDistanceLocale = {
  lessThanXSeconds: {
    one: "less than a second",
    other: "less than {{count}} seconds"
  },
  xSeconds: {
    one: "1 second",
    other: "{{count}} seconds"
  },
  halfAMinute: "half a minute",
  lessThanXMinutes: {
    one: "less than a minute",
    other: "less than {{count}} minutes"
  },
  xMinutes: {
    one: "1 minute",
    other: "{{count}} minutes"
  },
  aboutXHours: {
    one: "about 1 hour",
    other: "about {{count}} hours"
  },
  xHours: {
    one: "1 hour",
    other: "{{count}} hours"
  },
  xDays: {
    one: "1 day",
    other: "{{count}} days"
  },
  aboutXWeeks: {
    one: "about 1 week",
    other: "about {{count}} weeks"
  },
  xWeeks: {
    one: "1 week",
    other: "{{count}} weeks"
  },
  aboutXMonths: {
    one: "about 1 month",
    other: "about {{count}} months"
  },
  xMonths: {
    one: "1 month",
    other: "{{count}} months"
  },
  aboutXYears: {
    one: "about 1 year",
    other: "about {{count}} years"
  },
  xYears: {
    one: "1 year",
    other: "{{count}} years"
  },
  overXYears: {
    one: "over 1 year",
    other: "over {{count}} years"
  },
  almostXYears: {
    one: "almost 1 year",
    other: "almost {{count}} years"
  }
};
var formatDistance = (token, count, options) => {
  let result;
  const tokenValue = formatDistanceLocale[token];
  if (typeof tokenValue === "string") {
    result = tokenValue;
  } else if (count === 1) {
    result = tokenValue.one;
  } else {
    result = tokenValue.other.replace("{{count}}", count.toString());
  }
  if (options?.addSuffix) {
    if (options.comparison && options.comparison > 0) {
      return "in " + result;
    } else {
      return result + " ago";
    }
  }
  return result;
};

// node_modules/date-fns/locale/_lib/buildFormatLongFn.js
function buildFormatLongFn(args) {
  return (options = {}) => {
    const width = options.width ? String(options.width) : args.defaultWidth;
    const format = args.formats[width] || args.formats[args.defaultWidth];
    return format;
  };
}

// node_modules/date-fns/locale/en-US/_lib/formatLong.js
var dateFormats = {
  full: "EEEE, MMMM do, y",
  long: "MMMM do, y",
  medium: "MMM d, y",
  short: "MM/dd/yyyy"
};
var timeFormats = {
  full: "h:mm:ss a zzzz",
  long: "h:mm:ss a z",
  medium: "h:mm:ss a",
  short: "h:mm a"
};
var dateTimeFormats = {
  full: "{{date}} 'at' {{time}}",
  long: "{{date}} 'at' {{time}}",
  medium: "{{date}}, {{time}}",
  short: "{{date}}, {{time}}"
};
var formatLong = {
  date: buildFormatLongFn({
    formats: dateFormats,
    defaultWidth: "full"
  }),
  time: buildFormatLongFn({
    formats: timeFormats,
    defaultWidth: "full"
  }),
  dateTime: buildFormatLongFn({
    formats: dateTimeFormats,
    defaultWidth: "full"
  })
};

// node_modules/date-fns/locale/en-US/_lib/formatRelative.js
var formatRelativeLocale = {
  lastWeek: "'last' eeee 'at' p",
  yesterday: "'yesterday at' p",
  today: "'today at' p",
  tomorrow: "'tomorrow at' p",
  nextWeek: "eeee 'at' p",
  other: "P"
};
var formatRelative = (token, _date, _baseDate, _options) => formatRelativeLocale[token];

// node_modules/date-fns/locale/_lib/buildLocalizeFn.js
function buildLocalizeFn(args) {
  return (value, options) => {
    const context = options?.context ? String(options.context) : "standalone";
    let valuesArray;
    if (context === "formatting" && args.formattingValues) {
      const defaultWidth = args.defaultFormattingWidth || args.defaultWidth;
      const width = options?.width ? String(options.width) : defaultWidth;
      valuesArray = args.formattingValues[width] || args.formattingValues[defaultWidth];
    } else {
      const defaultWidth = args.defaultWidth;
      const width = options?.width ? String(options.width) : args.defaultWidth;
      valuesArray = args.values[width] || args.values[defaultWidth];
    }
    const index = args.argumentCallback ? args.argumentCallback(value) : value;
    return valuesArray[index];
  };
}

// node_modules/date-fns/locale/en-US/_lib/localize.js
var eraValues = {
  narrow: ["B", "A"],
  abbreviated: ["BC", "AD"],
  wide: ["Before Christ", "Anno Domini"]
};
var quarterValues = {
  narrow: ["1", "2", "3", "4"],
  abbreviated: ["Q1", "Q2", "Q3", "Q4"],
  wide: ["1st quarter", "2nd quarter", "3rd quarter", "4th quarter"]
};
var monthValues = {
  narrow: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
  abbreviated: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ],
  wide: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ]
};
var dayValues = {
  narrow: ["S", "M", "T", "W", "T", "F", "S"],
  short: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  abbreviated: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  wide: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ]
};
var dayPeriodValues = {
  narrow: {
    am: "a",
    pm: "p",
    midnight: "mi",
    noon: "n",
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night"
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "midnight",
    noon: "noon",
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night"
  },
  wide: {
    am: "a.m.",
    pm: "p.m.",
    midnight: "midnight",
    noon: "noon",
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night"
  }
};
var formattingDayPeriodValues = {
  narrow: {
    am: "a",
    pm: "p",
    midnight: "mi",
    noon: "n",
    morning: "in the morning",
    afternoon: "in the afternoon",
    evening: "in the evening",
    night: "at night"
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "midnight",
    noon: "noon",
    morning: "in the morning",
    afternoon: "in the afternoon",
    evening: "in the evening",
    night: "at night"
  },
  wide: {
    am: "a.m.",
    pm: "p.m.",
    midnight: "midnight",
    noon: "noon",
    morning: "in the morning",
    afternoon: "in the afternoon",
    evening: "in the evening",
    night: "at night"
  }
};
var ordinalNumber = (dirtyNumber, _options) => {
  const number = Number(dirtyNumber);
  const rem100 = number % 100;
  if (rem100 > 20 || rem100 < 10) {
    switch (rem100 % 10) {
      case 1:
        return number + "st";
      case 2:
        return number + "nd";
      case 3:
        return number + "rd";
    }
  }
  return number + "th";
};
var localize = {
  ordinalNumber,
  era: buildLocalizeFn({
    values: eraValues,
    defaultWidth: "wide"
  }),
  quarter: buildLocalizeFn({
    values: quarterValues,
    defaultWidth: "wide",
    argumentCallback: (quarter) => quarter - 1
  }),
  month: buildLocalizeFn({
    values: monthValues,
    defaultWidth: "wide"
  }),
  day: buildLocalizeFn({
    values: dayValues,
    defaultWidth: "wide"
  }),
  dayPeriod: buildLocalizeFn({
    values: dayPeriodValues,
    defaultWidth: "wide",
    formattingValues: formattingDayPeriodValues,
    defaultFormattingWidth: "wide"
  })
};

// node_modules/date-fns/locale/_lib/buildMatchFn.js
function buildMatchFn(args) {
  return (string, options = {}) => {
    const width = options.width;
    const matchPattern = width && args.matchPatterns[width] || args.matchPatterns[args.defaultMatchWidth];
    const matchResult = string.match(matchPattern);
    if (!matchResult) {
      return null;
    }
    const matchedString = matchResult[0];
    const parsePatterns = width && args.parsePatterns[width] || args.parsePatterns[args.defaultParseWidth];
    const key = Array.isArray(parsePatterns) ? findIndex(parsePatterns, (pattern) => pattern.test(matchedString)) : findKey(parsePatterns, (pattern) => pattern.test(matchedString));
    let value;
    value = args.valueCallback ? args.valueCallback(key) : key;
    value = options.valueCallback ? options.valueCallback(value) : value;
    const rest = string.slice(matchedString.length);
    return { value, rest };
  };
}
function findKey(object, predicate) {
  for (const key in object) {
    if (Object.prototype.hasOwnProperty.call(object, key) && predicate(object[key])) {
      return key;
    }
  }
  return;
}
function findIndex(array, predicate) {
  for (let key = 0;key < array.length; key++) {
    if (predicate(array[key])) {
      return key;
    }
  }
  return;
}

// node_modules/date-fns/locale/_lib/buildMatchPatternFn.js
function buildMatchPatternFn(args) {
  return (string, options = {}) => {
    const matchResult = string.match(args.matchPattern);
    if (!matchResult)
      return null;
    const matchedString = matchResult[0];
    const parseResult = string.match(args.parsePattern);
    if (!parseResult)
      return null;
    let value = args.valueCallback ? args.valueCallback(parseResult[0]) : parseResult[0];
    value = options.valueCallback ? options.valueCallback(value) : value;
    const rest = string.slice(matchedString.length);
    return { value, rest };
  };
}

// node_modules/date-fns/locale/en-US/_lib/match.js
var matchOrdinalNumberPattern = /^(\d+)(th|st|nd|rd)?/i;
var parseOrdinalNumberPattern = /\d+/i;
var matchEraPatterns = {
  narrow: /^(b|a)/i,
  abbreviated: /^(b\.?\s?c\.?|b\.?\s?c\.?\s?e\.?|a\.?\s?d\.?|c\.?\s?e\.?)/i,
  wide: /^(before christ|before common era|anno domini|common era)/i
};
var parseEraPatterns = {
  any: [/^b/i, /^(a|c)/i]
};
var matchQuarterPatterns = {
  narrow: /^[1234]/i,
  abbreviated: /^q[1234]/i,
  wide: /^[1234](th|st|nd|rd)? quarter/i
};
var parseQuarterPatterns = {
  any: [/1/i, /2/i, /3/i, /4/i]
};
var matchMonthPatterns = {
  narrow: /^[jfmasond]/i,
  abbreviated: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  wide: /^(january|february|march|april|may|june|july|august|september|october|november|december)/i
};
var parseMonthPatterns = {
  narrow: [
    /^j/i,
    /^f/i,
    /^m/i,
    /^a/i,
    /^m/i,
    /^j/i,
    /^j/i,
    /^a/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ],
  any: [
    /^ja/i,
    /^f/i,
    /^mar/i,
    /^ap/i,
    /^may/i,
    /^jun/i,
    /^jul/i,
    /^au/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ]
};
var matchDayPatterns = {
  narrow: /^[smtwf]/i,
  short: /^(su|mo|tu|we|th|fr|sa)/i,
  abbreviated: /^(sun|mon|tue|wed|thu|fri|sat)/i,
  wide: /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i
};
var parseDayPatterns = {
  narrow: [/^s/i, /^m/i, /^t/i, /^w/i, /^t/i, /^f/i, /^s/i],
  any: [/^su/i, /^m/i, /^tu/i, /^w/i, /^th/i, /^f/i, /^sa/i]
};
var matchDayPeriodPatterns = {
  narrow: /^(a|p|mi|n|(in the|at) (morning|afternoon|evening|night))/i,
  any: /^([ap]\.?\s?m\.?|midnight|noon|(in the|at) (morning|afternoon|evening|night))/i
};
var parseDayPeriodPatterns = {
  any: {
    am: /^a/i,
    pm: /^p/i,
    midnight: /^mi/i,
    noon: /^no/i,
    morning: /morning/i,
    afternoon: /afternoon/i,
    evening: /evening/i,
    night: /night/i
  }
};
var match = {
  ordinalNumber: buildMatchPatternFn({
    matchPattern: matchOrdinalNumberPattern,
    parsePattern: parseOrdinalNumberPattern,
    valueCallback: (value) => parseInt(value, 10)
  }),
  era: buildMatchFn({
    matchPatterns: matchEraPatterns,
    defaultMatchWidth: "wide",
    parsePatterns: parseEraPatterns,
    defaultParseWidth: "any"
  }),
  quarter: buildMatchFn({
    matchPatterns: matchQuarterPatterns,
    defaultMatchWidth: "wide",
    parsePatterns: parseQuarterPatterns,
    defaultParseWidth: "any",
    valueCallback: (index) => index + 1
  }),
  month: buildMatchFn({
    matchPatterns: matchMonthPatterns,
    defaultMatchWidth: "wide",
    parsePatterns: parseMonthPatterns,
    defaultParseWidth: "any"
  }),
  day: buildMatchFn({
    matchPatterns: matchDayPatterns,
    defaultMatchWidth: "wide",
    parsePatterns: parseDayPatterns,
    defaultParseWidth: "any"
  }),
  dayPeriod: buildMatchFn({
    matchPatterns: matchDayPeriodPatterns,
    defaultMatchWidth: "any",
    parsePatterns: parseDayPeriodPatterns,
    defaultParseWidth: "any"
  })
};

// node_modules/date-fns/locale/en-US.js
var enUS = {
  code: "en-US",
  formatDistance,
  formatLong,
  formatRelative,
  localize,
  match,
  options: {
    weekStartsOn: 0,
    firstWeekContainsDate: 1
  }
};
// node_modules/date-fns/getDayOfYear.js
function getDayOfYear(date, options) {
  const _date = toDate(date, options?.in);
  const diff = differenceInCalendarDays(_date, startOfYear(_date));
  const dayOfYear = diff + 1;
  return dayOfYear;
}

// node_modules/date-fns/getISOWeek.js
function getISOWeek(date, options) {
  const _date = toDate(date, options?.in);
  const diff = +startOfISOWeek(_date) - +startOfISOWeekYear(_date);
  return Math.round(diff / millisecondsInWeek) + 1;
}

// node_modules/date-fns/getWeekYear.js
function getWeekYear(date, options) {
  const _date = toDate(date, options?.in);
  const year = _date.getFullYear();
  const defaultOptions2 = getDefaultOptions();
  const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions2.firstWeekContainsDate ?? defaultOptions2.locale?.options?.firstWeekContainsDate ?? 1;
  const firstWeekOfNextYear = constructFrom(options?.in || date, 0);
  firstWeekOfNextYear.setFullYear(year + 1, 0, firstWeekContainsDate);
  firstWeekOfNextYear.setHours(0, 0, 0, 0);
  const startOfNextYear = startOfWeek(firstWeekOfNextYear, options);
  const firstWeekOfThisYear = constructFrom(options?.in || date, 0);
  firstWeekOfThisYear.setFullYear(year, 0, firstWeekContainsDate);
  firstWeekOfThisYear.setHours(0, 0, 0, 0);
  const startOfThisYear = startOfWeek(firstWeekOfThisYear, options);
  if (+_date >= +startOfNextYear) {
    return year + 1;
  } else if (+_date >= +startOfThisYear) {
    return year;
  } else {
    return year - 1;
  }
}

// node_modules/date-fns/startOfWeekYear.js
function startOfWeekYear(date, options) {
  const defaultOptions2 = getDefaultOptions();
  const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions2.firstWeekContainsDate ?? defaultOptions2.locale?.options?.firstWeekContainsDate ?? 1;
  const year = getWeekYear(date, options);
  const firstWeek = constructFrom(options?.in || date, 0);
  firstWeek.setFullYear(year, 0, firstWeekContainsDate);
  firstWeek.setHours(0, 0, 0, 0);
  const _date = startOfWeek(firstWeek, options);
  return _date;
}

// node_modules/date-fns/getWeek.js
function getWeek(date, options) {
  const _date = toDate(date, options?.in);
  const diff = +startOfWeek(_date, options) - +startOfWeekYear(_date, options);
  return Math.round(diff / millisecondsInWeek) + 1;
}

// node_modules/date-fns/_lib/addLeadingZeros.js
function addLeadingZeros(number, targetLength) {
  const sign = number < 0 ? "-" : "";
  const output = Math.abs(number).toString().padStart(targetLength, "0");
  return sign + output;
}

// node_modules/date-fns/_lib/format/lightFormatters.js
var lightFormatters = {
  y(date, token) {
    const signedYear = date.getFullYear();
    const year = signedYear > 0 ? signedYear : 1 - signedYear;
    return addLeadingZeros(token === "yy" ? year % 100 : year, token.length);
  },
  M(date, token) {
    const month = date.getMonth();
    return token === "M" ? String(month + 1) : addLeadingZeros(month + 1, 2);
  },
  d(date, token) {
    return addLeadingZeros(date.getDate(), token.length);
  },
  a(date, token) {
    const dayPeriodEnumValue = date.getHours() / 12 >= 1 ? "pm" : "am";
    switch (token) {
      case "a":
      case "aa":
        return dayPeriodEnumValue.toUpperCase();
      case "aaa":
        return dayPeriodEnumValue;
      case "aaaaa":
        return dayPeriodEnumValue[0];
      case "aaaa":
      default:
        return dayPeriodEnumValue === "am" ? "a.m." : "p.m.";
    }
  },
  h(date, token) {
    return addLeadingZeros(date.getHours() % 12 || 12, token.length);
  },
  H(date, token) {
    return addLeadingZeros(date.getHours(), token.length);
  },
  m(date, token) {
    return addLeadingZeros(date.getMinutes(), token.length);
  },
  s(date, token) {
    return addLeadingZeros(date.getSeconds(), token.length);
  },
  S(date, token) {
    const numberOfDigits = token.length;
    const milliseconds = date.getMilliseconds();
    const fractionalSeconds = Math.trunc(milliseconds * Math.pow(10, numberOfDigits - 3));
    return addLeadingZeros(fractionalSeconds, token.length);
  }
};

// node_modules/date-fns/_lib/format/formatters.js
var dayPeriodEnum = {
  am: "am",
  pm: "pm",
  midnight: "midnight",
  noon: "noon",
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
  night: "night"
};
var formatters = {
  G: function(date, token, localize2) {
    const era = date.getFullYear() > 0 ? 1 : 0;
    switch (token) {
      case "G":
      case "GG":
      case "GGG":
        return localize2.era(era, { width: "abbreviated" });
      case "GGGGG":
        return localize2.era(era, { width: "narrow" });
      case "GGGG":
      default:
        return localize2.era(era, { width: "wide" });
    }
  },
  y: function(date, token, localize2) {
    if (token === "yo") {
      const signedYear = date.getFullYear();
      const year = signedYear > 0 ? signedYear : 1 - signedYear;
      return localize2.ordinalNumber(year, { unit: "year" });
    }
    return lightFormatters.y(date, token);
  },
  Y: function(date, token, localize2, options) {
    const signedWeekYear = getWeekYear(date, options);
    const weekYear = signedWeekYear > 0 ? signedWeekYear : 1 - signedWeekYear;
    if (token === "YY") {
      const twoDigitYear = weekYear % 100;
      return addLeadingZeros(twoDigitYear, 2);
    }
    if (token === "Yo") {
      return localize2.ordinalNumber(weekYear, { unit: "year" });
    }
    return addLeadingZeros(weekYear, token.length);
  },
  R: function(date, token) {
    const isoWeekYear = getISOWeekYear(date);
    return addLeadingZeros(isoWeekYear, token.length);
  },
  u: function(date, token) {
    const year = date.getFullYear();
    return addLeadingZeros(year, token.length);
  },
  Q: function(date, token, localize2) {
    const quarter = Math.ceil((date.getMonth() + 1) / 3);
    switch (token) {
      case "Q":
        return String(quarter);
      case "QQ":
        return addLeadingZeros(quarter, 2);
      case "Qo":
        return localize2.ordinalNumber(quarter, { unit: "quarter" });
      case "QQQ":
        return localize2.quarter(quarter, {
          width: "abbreviated",
          context: "formatting"
        });
      case "QQQQQ":
        return localize2.quarter(quarter, {
          width: "narrow",
          context: "formatting"
        });
      case "QQQQ":
      default:
        return localize2.quarter(quarter, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  q: function(date, token, localize2) {
    const quarter = Math.ceil((date.getMonth() + 1) / 3);
    switch (token) {
      case "q":
        return String(quarter);
      case "qq":
        return addLeadingZeros(quarter, 2);
      case "qo":
        return localize2.ordinalNumber(quarter, { unit: "quarter" });
      case "qqq":
        return localize2.quarter(quarter, {
          width: "abbreviated",
          context: "standalone"
        });
      case "qqqqq":
        return localize2.quarter(quarter, {
          width: "narrow",
          context: "standalone"
        });
      case "qqqq":
      default:
        return localize2.quarter(quarter, {
          width: "wide",
          context: "standalone"
        });
    }
  },
  M: function(date, token, localize2) {
    const month = date.getMonth();
    switch (token) {
      case "M":
      case "MM":
        return lightFormatters.M(date, token);
      case "Mo":
        return localize2.ordinalNumber(month + 1, { unit: "month" });
      case "MMM":
        return localize2.month(month, {
          width: "abbreviated",
          context: "formatting"
        });
      case "MMMMM":
        return localize2.month(month, {
          width: "narrow",
          context: "formatting"
        });
      case "MMMM":
      default:
        return localize2.month(month, { width: "wide", context: "formatting" });
    }
  },
  L: function(date, token, localize2) {
    const month = date.getMonth();
    switch (token) {
      case "L":
        return String(month + 1);
      case "LL":
        return addLeadingZeros(month + 1, 2);
      case "Lo":
        return localize2.ordinalNumber(month + 1, { unit: "month" });
      case "LLL":
        return localize2.month(month, {
          width: "abbreviated",
          context: "standalone"
        });
      case "LLLLL":
        return localize2.month(month, {
          width: "narrow",
          context: "standalone"
        });
      case "LLLL":
      default:
        return localize2.month(month, { width: "wide", context: "standalone" });
    }
  },
  w: function(date, token, localize2, options) {
    const week = getWeek(date, options);
    if (token === "wo") {
      return localize2.ordinalNumber(week, { unit: "week" });
    }
    return addLeadingZeros(week, token.length);
  },
  I: function(date, token, localize2) {
    const isoWeek = getISOWeek(date);
    if (token === "Io") {
      return localize2.ordinalNumber(isoWeek, { unit: "week" });
    }
    return addLeadingZeros(isoWeek, token.length);
  },
  d: function(date, token, localize2) {
    if (token === "do") {
      return localize2.ordinalNumber(date.getDate(), { unit: "date" });
    }
    return lightFormatters.d(date, token);
  },
  D: function(date, token, localize2) {
    const dayOfYear = getDayOfYear(date);
    if (token === "Do") {
      return localize2.ordinalNumber(dayOfYear, { unit: "dayOfYear" });
    }
    return addLeadingZeros(dayOfYear, token.length);
  },
  E: function(date, token, localize2) {
    const dayOfWeek = date.getDay();
    switch (token) {
      case "E":
      case "EE":
      case "EEE":
        return localize2.day(dayOfWeek, {
          width: "abbreviated",
          context: "formatting"
        });
      case "EEEEE":
        return localize2.day(dayOfWeek, {
          width: "narrow",
          context: "formatting"
        });
      case "EEEEEE":
        return localize2.day(dayOfWeek, {
          width: "short",
          context: "formatting"
        });
      case "EEEE":
      default:
        return localize2.day(dayOfWeek, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  e: function(date, token, localize2, options) {
    const dayOfWeek = date.getDay();
    const localDayOfWeek = (dayOfWeek - options.weekStartsOn + 8) % 7 || 7;
    switch (token) {
      case "e":
        return String(localDayOfWeek);
      case "ee":
        return addLeadingZeros(localDayOfWeek, 2);
      case "eo":
        return localize2.ordinalNumber(localDayOfWeek, { unit: "day" });
      case "eee":
        return localize2.day(dayOfWeek, {
          width: "abbreviated",
          context: "formatting"
        });
      case "eeeee":
        return localize2.day(dayOfWeek, {
          width: "narrow",
          context: "formatting"
        });
      case "eeeeee":
        return localize2.day(dayOfWeek, {
          width: "short",
          context: "formatting"
        });
      case "eeee":
      default:
        return localize2.day(dayOfWeek, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  c: function(date, token, localize2, options) {
    const dayOfWeek = date.getDay();
    const localDayOfWeek = (dayOfWeek - options.weekStartsOn + 8) % 7 || 7;
    switch (token) {
      case "c":
        return String(localDayOfWeek);
      case "cc":
        return addLeadingZeros(localDayOfWeek, token.length);
      case "co":
        return localize2.ordinalNumber(localDayOfWeek, { unit: "day" });
      case "ccc":
        return localize2.day(dayOfWeek, {
          width: "abbreviated",
          context: "standalone"
        });
      case "ccccc":
        return localize2.day(dayOfWeek, {
          width: "narrow",
          context: "standalone"
        });
      case "cccccc":
        return localize2.day(dayOfWeek, {
          width: "short",
          context: "standalone"
        });
      case "cccc":
      default:
        return localize2.day(dayOfWeek, {
          width: "wide",
          context: "standalone"
        });
    }
  },
  i: function(date, token, localize2) {
    const dayOfWeek = date.getDay();
    const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
    switch (token) {
      case "i":
        return String(isoDayOfWeek);
      case "ii":
        return addLeadingZeros(isoDayOfWeek, token.length);
      case "io":
        return localize2.ordinalNumber(isoDayOfWeek, { unit: "day" });
      case "iii":
        return localize2.day(dayOfWeek, {
          width: "abbreviated",
          context: "formatting"
        });
      case "iiiii":
        return localize2.day(dayOfWeek, {
          width: "narrow",
          context: "formatting"
        });
      case "iiiiii":
        return localize2.day(dayOfWeek, {
          width: "short",
          context: "formatting"
        });
      case "iiii":
      default:
        return localize2.day(dayOfWeek, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  a: function(date, token, localize2) {
    const hours = date.getHours();
    const dayPeriodEnumValue = hours / 12 >= 1 ? "pm" : "am";
    switch (token) {
      case "a":
      case "aa":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "abbreviated",
          context: "formatting"
        });
      case "aaa":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "abbreviated",
          context: "formatting"
        }).toLowerCase();
      case "aaaaa":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "narrow",
          context: "formatting"
        });
      case "aaaa":
      default:
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  b: function(date, token, localize2) {
    const hours = date.getHours();
    let dayPeriodEnumValue;
    if (hours === 12) {
      dayPeriodEnumValue = dayPeriodEnum.noon;
    } else if (hours === 0) {
      dayPeriodEnumValue = dayPeriodEnum.midnight;
    } else {
      dayPeriodEnumValue = hours / 12 >= 1 ? "pm" : "am";
    }
    switch (token) {
      case "b":
      case "bb":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "abbreviated",
          context: "formatting"
        });
      case "bbb":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "abbreviated",
          context: "formatting"
        }).toLowerCase();
      case "bbbbb":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "narrow",
          context: "formatting"
        });
      case "bbbb":
      default:
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  B: function(date, token, localize2) {
    const hours = date.getHours();
    let dayPeriodEnumValue;
    if (hours >= 17) {
      dayPeriodEnumValue = dayPeriodEnum.evening;
    } else if (hours >= 12) {
      dayPeriodEnumValue = dayPeriodEnum.afternoon;
    } else if (hours >= 4) {
      dayPeriodEnumValue = dayPeriodEnum.morning;
    } else {
      dayPeriodEnumValue = dayPeriodEnum.night;
    }
    switch (token) {
      case "B":
      case "BB":
      case "BBB":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "abbreviated",
          context: "formatting"
        });
      case "BBBBB":
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "narrow",
          context: "formatting"
        });
      case "BBBB":
      default:
        return localize2.dayPeriod(dayPeriodEnumValue, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  h: function(date, token, localize2) {
    if (token === "ho") {
      let hours = date.getHours() % 12;
      if (hours === 0)
        hours = 12;
      return localize2.ordinalNumber(hours, { unit: "hour" });
    }
    return lightFormatters.h(date, token);
  },
  H: function(date, token, localize2) {
    if (token === "Ho") {
      return localize2.ordinalNumber(date.getHours(), { unit: "hour" });
    }
    return lightFormatters.H(date, token);
  },
  K: function(date, token, localize2) {
    const hours = date.getHours() % 12;
    if (token === "Ko") {
      return localize2.ordinalNumber(hours, { unit: "hour" });
    }
    return addLeadingZeros(hours, token.length);
  },
  k: function(date, token, localize2) {
    let hours = date.getHours();
    if (hours === 0)
      hours = 24;
    if (token === "ko") {
      return localize2.ordinalNumber(hours, { unit: "hour" });
    }
    return addLeadingZeros(hours, token.length);
  },
  m: function(date, token, localize2) {
    if (token === "mo") {
      return localize2.ordinalNumber(date.getMinutes(), { unit: "minute" });
    }
    return lightFormatters.m(date, token);
  },
  s: function(date, token, localize2) {
    if (token === "so") {
      return localize2.ordinalNumber(date.getSeconds(), { unit: "second" });
    }
    return lightFormatters.s(date, token);
  },
  S: function(date, token) {
    return lightFormatters.S(date, token);
  },
  X: function(date, token, _localize) {
    const timezoneOffset = date.getTimezoneOffset();
    if (timezoneOffset === 0) {
      return "Z";
    }
    switch (token) {
      case "X":
        return formatTimezoneWithOptionalMinutes(timezoneOffset);
      case "XXXX":
      case "XX":
        return formatTimezone(timezoneOffset);
      case "XXXXX":
      case "XXX":
      default:
        return formatTimezone(timezoneOffset, ":");
    }
  },
  x: function(date, token, _localize) {
    const timezoneOffset = date.getTimezoneOffset();
    switch (token) {
      case "x":
        return formatTimezoneWithOptionalMinutes(timezoneOffset);
      case "xxxx":
      case "xx":
        return formatTimezone(timezoneOffset);
      case "xxxxx":
      case "xxx":
      default:
        return formatTimezone(timezoneOffset, ":");
    }
  },
  O: function(date, token, _localize) {
    const timezoneOffset = date.getTimezoneOffset();
    switch (token) {
      case "O":
      case "OO":
      case "OOO":
        return "GMT" + formatTimezoneShort(timezoneOffset, ":");
      case "OOOO":
      default:
        return "GMT" + formatTimezone(timezoneOffset, ":");
    }
  },
  z: function(date, token, _localize) {
    const timezoneOffset = date.getTimezoneOffset();
    switch (token) {
      case "z":
      case "zz":
      case "zzz":
        return "GMT" + formatTimezoneShort(timezoneOffset, ":");
      case "zzzz":
      default:
        return "GMT" + formatTimezone(timezoneOffset, ":");
    }
  },
  t: function(date, token, _localize) {
    const timestamp = Math.trunc(+date / 1000);
    return addLeadingZeros(timestamp, token.length);
  },
  T: function(date, token, _localize) {
    return addLeadingZeros(+date, token.length);
  }
};
function formatTimezoneShort(offset, delimiter = "") {
  const sign = offset > 0 ? "-" : "+";
  const absOffset = Math.abs(offset);
  const hours = Math.trunc(absOffset / 60);
  const minutes = absOffset % 60;
  if (minutes === 0) {
    return sign + String(hours);
  }
  return sign + String(hours) + delimiter + addLeadingZeros(minutes, 2);
}
function formatTimezoneWithOptionalMinutes(offset, delimiter) {
  if (offset % 60 === 0) {
    const sign = offset > 0 ? "-" : "+";
    return sign + addLeadingZeros(Math.abs(offset) / 60, 2);
  }
  return formatTimezone(offset, delimiter);
}
function formatTimezone(offset, delimiter = "") {
  const sign = offset > 0 ? "-" : "+";
  const absOffset = Math.abs(offset);
  const hours = addLeadingZeros(Math.trunc(absOffset / 60), 2);
  const minutes = addLeadingZeros(absOffset % 60, 2);
  return sign + hours + delimiter + minutes;
}

// node_modules/date-fns/_lib/format/longFormatters.js
var dateLongFormatter = (pattern, formatLong2) => {
  switch (pattern) {
    case "P":
      return formatLong2.date({ width: "short" });
    case "PP":
      return formatLong2.date({ width: "medium" });
    case "PPP":
      return formatLong2.date({ width: "long" });
    case "PPPP":
    default:
      return formatLong2.date({ width: "full" });
  }
};
var timeLongFormatter = (pattern, formatLong2) => {
  switch (pattern) {
    case "p":
      return formatLong2.time({ width: "short" });
    case "pp":
      return formatLong2.time({ width: "medium" });
    case "ppp":
      return formatLong2.time({ width: "long" });
    case "pppp":
    default:
      return formatLong2.time({ width: "full" });
  }
};
var dateTimeLongFormatter = (pattern, formatLong2) => {
  const matchResult = pattern.match(/(P+)(p+)?/) || [];
  const datePattern = matchResult[1];
  const timePattern = matchResult[2];
  if (!timePattern) {
    return dateLongFormatter(pattern, formatLong2);
  }
  let dateTimeFormat;
  switch (datePattern) {
    case "P":
      dateTimeFormat = formatLong2.dateTime({ width: "short" });
      break;
    case "PP":
      dateTimeFormat = formatLong2.dateTime({ width: "medium" });
      break;
    case "PPP":
      dateTimeFormat = formatLong2.dateTime({ width: "long" });
      break;
    case "PPPP":
    default:
      dateTimeFormat = formatLong2.dateTime({ width: "full" });
      break;
  }
  return dateTimeFormat.replace("{{date}}", dateLongFormatter(datePattern, formatLong2)).replace("{{time}}", timeLongFormatter(timePattern, formatLong2));
};
var longFormatters = {
  p: timeLongFormatter,
  P: dateTimeLongFormatter
};

// node_modules/date-fns/_lib/protectedTokens.js
var dayOfYearTokenRE = /^D+$/;
var weekYearTokenRE = /^Y+$/;
var throwTokens = ["D", "DD", "YY", "YYYY"];
function isProtectedDayOfYearToken(token) {
  return dayOfYearTokenRE.test(token);
}
function isProtectedWeekYearToken(token) {
  return weekYearTokenRE.test(token);
}
function warnOrThrowProtectedError(token, format, input) {
  const _message = message(token, format, input);
  console.warn(_message);
  if (throwTokens.includes(token))
    throw new RangeError(_message);
}
function message(token, format, input) {
  const subject = token[0] === "Y" ? "years" : "days of the month";
  return `Use \`${token.toLowerCase()}\` instead of \`${token}\` (in \`${format}\`) for formatting ${subject} to the input \`${input}\`; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md`;
}

// node_modules/date-fns/format.js
var formattingTokensRegExp = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g;
var longFormattingTokensRegExp = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g;
var escapedStringRegExp = /^'([^]*?)'?$/;
var doubleQuoteRegExp = /''/g;
var unescapedLatinCharacterRegExp = /[a-zA-Z]/;
function format(date, formatStr, options) {
  const defaultOptions2 = getDefaultOptions();
  const locale = options?.locale ?? defaultOptions2.locale ?? enUS;
  const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions2.firstWeekContainsDate ?? defaultOptions2.locale?.options?.firstWeekContainsDate ?? 1;
  const weekStartsOn = options?.weekStartsOn ?? options?.locale?.options?.weekStartsOn ?? defaultOptions2.weekStartsOn ?? defaultOptions2.locale?.options?.weekStartsOn ?? 0;
  const originalDate = toDate(date, options?.in);
  if (!isValid(originalDate)) {
    throw new RangeError("Invalid time value");
  }
  let parts = formatStr.match(longFormattingTokensRegExp).map((substring) => {
    const firstCharacter = substring[0];
    if (firstCharacter === "p" || firstCharacter === "P") {
      const longFormatter = longFormatters[firstCharacter];
      return longFormatter(substring, locale.formatLong);
    }
    return substring;
  }).join("").match(formattingTokensRegExp).map((substring) => {
    if (substring === "''") {
      return { isToken: false, value: "'" };
    }
    const firstCharacter = substring[0];
    if (firstCharacter === "'") {
      return { isToken: false, value: cleanEscapedString(substring) };
    }
    if (formatters[firstCharacter]) {
      return { isToken: true, value: substring };
    }
    if (firstCharacter.match(unescapedLatinCharacterRegExp)) {
      throw new RangeError("Format string contains an unescaped latin alphabet character `" + firstCharacter + "`");
    }
    return { isToken: false, value: substring };
  });
  if (locale.localize.preprocessor) {
    parts = locale.localize.preprocessor(originalDate, parts);
  }
  const formatterOptions = {
    firstWeekContainsDate,
    weekStartsOn,
    locale
  };
  return parts.map((part) => {
    if (!part.isToken)
      return part.value;
    const token = part.value;
    if (!options?.useAdditionalWeekYearTokens && isProtectedWeekYearToken(token) || !options?.useAdditionalDayOfYearTokens && isProtectedDayOfYearToken(token)) {
      warnOrThrowProtectedError(token, formatStr, String(date));
    }
    const formatter = formatters[token[0]];
    return formatter(originalDate, token, locale.localize, formatterOptions);
  }).join("");
}
function cleanEscapedString(input) {
  const matched = input.match(escapedStringRegExp);
  if (!matched) {
    return input;
  }
  return matched[1].replace(doubleQuoteRegExp, "'");
}

// node_modules/date-fns/locale/tr/_lib/formatDistance.js
var formatDistanceLocale2 = {
  lessThanXSeconds: {
    one: "bir saniyeden az",
    other: "{{count}} saniyeden az"
  },
  xSeconds: {
    one: "1 saniye",
    other: "{{count}} saniye"
  },
  halfAMinute: "yarım dakika",
  lessThanXMinutes: {
    one: "bir dakikadan az",
    other: "{{count}} dakikadan az"
  },
  xMinutes: {
    one: "1 dakika",
    other: "{{count}} dakika"
  },
  aboutXHours: {
    one: "yaklaşık 1 saat",
    other: "yaklaşık {{count}} saat"
  },
  xHours: {
    one: "1 saat",
    other: "{{count}} saat"
  },
  xDays: {
    one: "1 gün",
    other: "{{count}} gün"
  },
  aboutXWeeks: {
    one: "yaklaşık 1 hafta",
    other: "yaklaşık {{count}} hafta"
  },
  xWeeks: {
    one: "1 hafta",
    other: "{{count}} hafta"
  },
  aboutXMonths: {
    one: "yaklaşık 1 ay",
    other: "yaklaşık {{count}} ay"
  },
  xMonths: {
    one: "1 ay",
    other: "{{count}} ay"
  },
  aboutXYears: {
    one: "yaklaşık 1 yıl",
    other: "yaklaşık {{count}} yıl"
  },
  xYears: {
    one: "1 yıl",
    other: "{{count}} yıl"
  },
  overXYears: {
    one: "1 yıldan fazla",
    other: "{{count}} yıldan fazla"
  },
  almostXYears: {
    one: "neredeyse 1 yıl",
    other: "neredeyse {{count}} yıl"
  }
};
var formatDistance2 = (token, count, options) => {
  let result;
  const tokenValue = formatDistanceLocale2[token];
  if (typeof tokenValue === "string") {
    result = tokenValue;
  } else if (count === 1) {
    result = tokenValue.one;
  } else {
    result = tokenValue.other.replace("{{count}}", count.toString());
  }
  if (options?.addSuffix) {
    if (options.comparison && options.comparison > 0) {
      return result + " sonra";
    } else {
      return result + " önce";
    }
  }
  return result;
};

// node_modules/date-fns/locale/tr/_lib/formatLong.js
var dateFormats2 = {
  full: "d MMMM y EEEE",
  long: "d MMMM y",
  medium: "d MMM y",
  short: "dd.MM.yyyy"
};
var timeFormats2 = {
  full: "HH:mm:ss zzzz",
  long: "HH:mm:ss z",
  medium: "HH:mm:ss",
  short: "HH:mm"
};
var dateTimeFormats2 = {
  full: "{{date}} 'saat' {{time}}",
  long: "{{date}} 'saat' {{time}}",
  medium: "{{date}}, {{time}}",
  short: "{{date}}, {{time}}"
};
var formatLong2 = {
  date: buildFormatLongFn({
    formats: dateFormats2,
    defaultWidth: "full"
  }),
  time: buildFormatLongFn({
    formats: timeFormats2,
    defaultWidth: "full"
  }),
  dateTime: buildFormatLongFn({
    formats: dateTimeFormats2,
    defaultWidth: "full"
  })
};

// node_modules/date-fns/locale/tr/_lib/formatRelative.js
var formatRelativeLocale2 = {
  lastWeek: "'geçen hafta' eeee 'saat' p",
  yesterday: "'dün saat' p",
  today: "'bugün saat' p",
  tomorrow: "'yarın saat' p",
  nextWeek: "eeee 'saat' p",
  other: "P"
};
var formatRelative2 = (token, _date, _baseDate, _options) => formatRelativeLocale2[token];

// node_modules/date-fns/locale/tr/_lib/localize.js
var eraValues2 = {
  narrow: ["MÖ", "MS"],
  abbreviated: ["MÖ", "MS"],
  wide: ["Milattan Önce", "Milattan Sonra"]
};
var quarterValues2 = {
  narrow: ["1", "2", "3", "4"],
  abbreviated: ["1Ç", "2Ç", "3Ç", "4Ç"],
  wide: ["İlk çeyrek", "İkinci Çeyrek", "Üçüncü çeyrek", "Son çeyrek"]
};
var monthValues2 = {
  narrow: ["O", "Ş", "M", "N", "M", "H", "T", "A", "E", "E", "K", "A"],
  abbreviated: [
    "Oca",
    "Şub",
    "Mar",
    "Nis",
    "May",
    "Haz",
    "Tem",
    "Ağu",
    "Eyl",
    "Eki",
    "Kas",
    "Ara"
  ],
  wide: [
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık"
  ]
};
var dayValues2 = {
  narrow: ["P", "P", "S", "Ç", "P", "C", "C"],
  short: ["Pz", "Pt", "Sa", "Ça", "Pe", "Cu", "Ct"],
  abbreviated: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cts"],
  wide: [
    "Pazar",
    "Pazartesi",
    "Salı",
    "Çarşamba",
    "Perşembe",
    "Cuma",
    "Cumartesi"
  ]
};
var dayPeriodValues2 = {
  narrow: {
    am: "öö",
    pm: "ös",
    midnight: "gy",
    noon: "ö",
    morning: "sa",
    afternoon: "ös",
    evening: "ak",
    night: "ge"
  },
  abbreviated: {
    am: "ÖÖ",
    pm: "ÖS",
    midnight: "gece yarısı",
    noon: "öğle",
    morning: "sabah",
    afternoon: "öğleden sonra",
    evening: "akşam",
    night: "gece"
  },
  wide: {
    am: "Ö.Ö.",
    pm: "Ö.S.",
    midnight: "gece yarısı",
    noon: "öğle",
    morning: "sabah",
    afternoon: "öğleden sonra",
    evening: "akşam",
    night: "gece"
  }
};
var formattingDayPeriodValues2 = {
  narrow: {
    am: "öö",
    pm: "ös",
    midnight: "gy",
    noon: "ö",
    morning: "sa",
    afternoon: "ös",
    evening: "ak",
    night: "ge"
  },
  abbreviated: {
    am: "ÖÖ",
    pm: "ÖS",
    midnight: "gece yarısı",
    noon: "öğlen",
    morning: "sabahleyin",
    afternoon: "öğleden sonra",
    evening: "akşamleyin",
    night: "geceleyin"
  },
  wide: {
    am: "ö.ö.",
    pm: "ö.s.",
    midnight: "gece yarısı",
    noon: "öğlen",
    morning: "sabahleyin",
    afternoon: "öğleden sonra",
    evening: "akşamleyin",
    night: "geceleyin"
  }
};
var ordinalNumber2 = (dirtyNumber, _options) => {
  const number = Number(dirtyNumber);
  return number + ".";
};
var localize2 = {
  ordinalNumber: ordinalNumber2,
  era: buildLocalizeFn({
    values: eraValues2,
    defaultWidth: "wide"
  }),
  quarter: buildLocalizeFn({
    values: quarterValues2,
    defaultWidth: "wide",
    argumentCallback: (quarter) => Number(quarter) - 1
  }),
  month: buildLocalizeFn({
    values: monthValues2,
    defaultWidth: "wide"
  }),
  day: buildLocalizeFn({
    values: dayValues2,
    defaultWidth: "wide"
  }),
  dayPeriod: buildLocalizeFn({
    values: dayPeriodValues2,
    defaultWidth: "wide",
    formattingValues: formattingDayPeriodValues2,
    defaultFormattingWidth: "wide"
  })
};

// node_modules/date-fns/locale/tr/_lib/match.js
var matchOrdinalNumberPattern2 = /^(\d+)(\.)?/i;
var parseOrdinalNumberPattern2 = /\d+/i;
var matchEraPatterns2 = {
  narrow: /^(mö|ms)/i,
  abbreviated: /^(mö|ms)/i,
  wide: /^(milattan önce|milattan sonra)/i
};
var parseEraPatterns2 = {
  any: [/(^mö|^milattan önce)/i, /(^ms|^milattan sonra)/i]
};
var matchQuarterPatterns2 = {
  narrow: /^[1234]/i,
  abbreviated: /^[1234]ç/i,
  wide: /^((i|İ)lk|(i|İ)kinci|üçüncü|son) çeyrek/i
};
var parseQuarterPatterns2 = {
  any: [/1/i, /2/i, /3/i, /4/i],
  abbreviated: [/1ç/i, /2ç/i, /3ç/i, /4ç/i],
  wide: [
    /^(i|İ)lk çeyrek/i,
    /(i|İ)kinci çeyrek/i,
    /üçüncü çeyrek/i,
    /son çeyrek/i
  ]
};
var matchMonthPatterns2 = {
  narrow: /^[oşmnhtaek]/i,
  abbreviated: /^(oca|şub|mar|nis|may|haz|tem|ağu|eyl|eki|kas|ara)/i,
  wide: /^(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/i
};
var parseMonthPatterns2 = {
  narrow: [
    /^o/i,
    /^ş/i,
    /^m/i,
    /^n/i,
    /^m/i,
    /^h/i,
    /^t/i,
    /^a/i,
    /^e/i,
    /^e/i,
    /^k/i,
    /^a/i
  ],
  any: [
    /^o/i,
    /^ş/i,
    /^mar/i,
    /^n/i,
    /^may/i,
    /^h/i,
    /^t/i,
    /^ağ/i,
    /^ey/i,
    /^ek/i,
    /^k/i,
    /^ar/i
  ]
};
var matchDayPatterns2 = {
  narrow: /^[psçc]/i,
  short: /^(pz|pt|sa|ça|pe|cu|ct)/i,
  abbreviated: /^(paz|pzt|sal|çar|per|cum|cts)/i,
  wide: /^(pazar(?!tesi)|pazartesi|salı|çarşamba|perşembe|cuma(?!rtesi)|cumartesi)/i
};
var parseDayPatterns2 = {
  narrow: [/^p/i, /^p/i, /^s/i, /^ç/i, /^p/i, /^c/i, /^c/i],
  any: [/^pz/i, /^pt/i, /^sa/i, /^ça/i, /^pe/i, /^cu/i, /^ct/i],
  wide: [
    /^pazar(?!tesi)/i,
    /^pazartesi/i,
    /^salı/i,
    /^çarşamba/i,
    /^perşembe/i,
    /^cuma(?!rtesi)/i,
    /^cumartesi/i
  ]
};
var matchDayPeriodPatterns2 = {
  narrow: /^(öö|ös|gy|ö|sa|ös|ak|ge)/i,
  any: /^(ö\.?\s?[ös]\.?|öğleden sonra|gece yarısı|öğle|(sabah|öğ|akşam|gece)(leyin))/i
};
var parseDayPeriodPatterns2 = {
  any: {
    am: /^ö\.?ö\.?/i,
    pm: /^ö\.?s\.?/i,
    midnight: /^(gy|gece yarısı)/i,
    noon: /^öğ/i,
    morning: /^sa/i,
    afternoon: /^öğleden sonra/i,
    evening: /^ak/i,
    night: /^ge/i
  }
};
var match2 = {
  ordinalNumber: buildMatchPatternFn({
    matchPattern: matchOrdinalNumberPattern2,
    parsePattern: parseOrdinalNumberPattern2,
    valueCallback: function(value) {
      return parseInt(value, 10);
    }
  }),
  era: buildMatchFn({
    matchPatterns: matchEraPatterns2,
    defaultMatchWidth: "wide",
    parsePatterns: parseEraPatterns2,
    defaultParseWidth: "any"
  }),
  quarter: buildMatchFn({
    matchPatterns: matchQuarterPatterns2,
    defaultMatchWidth: "wide",
    parsePatterns: parseQuarterPatterns2,
    defaultParseWidth: "any",
    valueCallback: (index) => index + 1
  }),
  month: buildMatchFn({
    matchPatterns: matchMonthPatterns2,
    defaultMatchWidth: "wide",
    parsePatterns: parseMonthPatterns2,
    defaultParseWidth: "any"
  }),
  day: buildMatchFn({
    matchPatterns: matchDayPatterns2,
    defaultMatchWidth: "wide",
    parsePatterns: parseDayPatterns2,
    defaultParseWidth: "any"
  }),
  dayPeriod: buildMatchFn({
    matchPatterns: matchDayPeriodPatterns2,
    defaultMatchWidth: "any",
    parsePatterns: parseDayPeriodPatterns2,
    defaultParseWidth: "any"
  })
};

// node_modules/date-fns/locale/tr.js
var tr = {
  code: "tr",
  formatDistance: formatDistance2,
  formatLong: formatLong2,
  formatRelative: formatRelative2,
  localize: localize2,
  match: match2,
  options: {
    weekStartsOn: 1,
    firstWeekContainsDate: 1
  }
};

// scripts/build-rss-ozet.ts
var OUTPUT_PATH = import_node_path.default.join(process.cwd(), "download", "rss_ozet.md");
var SHINGLE1_THRESHOLD = 0.22;
var SHINGLE2_THRESHOLD = 0.2;
var MAX_SOURCES_PER_GROUP = 5;
var MIN_SUMMARY_WORDS = 150;
var REBUILD_ONLY = process.env.REBUILD_ONLY === "1";
var TURKISH_STOPWORDS = new Set([
  "ve",
  "veya",
  "ile",
  "için",
  "gibi",
  "kadar",
  "sadece",
  "daha",
  "çok",
  "az",
  "bir",
  "iki",
  "üç",
  "dört",
  "beş",
  "altı",
  "yedi",
  "sekiz",
  "dokuz",
  "on",
  "bu",
  "şu",
  "o",
  "ben",
  "sen",
  "biz",
  "siz",
  "onlar",
  "bizler",
  "da",
  "de",
  "ta",
  "te",
  "ki",
  "mi",
  "mı",
  "mu",
  "mü",
  "ne",
  "nasıl",
  "niçin",
  "niye",
  "olan",
  "olarak",
  "göre",
  "sonra",
  "önce",
  "en",
  "her",
  "hiç",
  "ama",
  "fakat",
  "lakin",
  "ancak",
  "şey",
  "yani",
  "ise",
  "ya",
  "veyahut",
  "hem",
  "değil",
  "üzere",
  "rağmen",
  "kez",
  "doğru",
  "tam",
  "üzerine",
  "yerine",
  "diye",
  "beri",
  "böyle",
  "şöyle",
  "neden",
  "hangi",
  "olduğu",
  "oldu",
  "olacak",
  "olmuş",
  "oluyor",
  "bunlar",
  "şunlar"
]);
var CATEGORY_LIMITS = {
  "Güncel": 10,
  "Kamu / Resmi": 7,
  "Ekonomi / Finans": 7,
  "Spor / Magazin": 5,
  "Bilim / Teknoloji": 3,
  "Kültür / Sanat": 3
};
var CATEGORY_ORDER = Object.keys(CATEGORY_LIMITS);
var TR_MONTHS = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara"
];
var zaiPromise = null;
async function getZAI() {
  if (!zaiPromise)
    zaiPromise = dist_default.create();
  return zaiPromise;
}
function normalize(text) {
  if (!text)
    return "";
  let t = text.toLowerCase().replace(/İ/g, "i").replace(/I/g, "ı").replace(/[^\w\sçğıöşüâîû]/g, " ").replace(/\s+/g, " ").trim();
  const words = t.split(" ").filter((w) => w && !TURKISH_STOPWORDS.has(w) && w.length > 2);
  return words.join(" ");
}
function shingles(text, n) {
  const words = text.split(" ").filter(Boolean);
  if (words.length < n)
    return new Set([words.join(" ")]);
  const out = new Set;
  for (let i = 0;i <= words.length - n; i += 1) {
    out.add(words.slice(i, i + n).join(" "));
  }
  return out;
}
function jaccard(a, b) {
  if (!a.size || !b.size)
    return 0;
  let inter = 0;
  for (const x of a)
    if (b.has(x))
      inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
function isSimilar(sh1A, sh2A, sh1B, sh2B) {
  if (jaccard(sh2A, sh2B) >= SHINGLE2_THRESHOLD)
    return true;
  if (jaccard(sh1A, sh1B) >= SHINGLE1_THRESHOLD)
    return true;
  return false;
}

class UnionFind {
  parent;
  rank;
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb)
      return;
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
    } else {
      this.parent[rb] = ra;
      if (this.rank[ra] === this.rank[rb])
        this.rank[ra] += 1;
    }
  }
}
function fmtDate(d) {
  if (!d)
    return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime()))
    return "";
  return `${date.getDate()} ${TR_MONTHS[date.getMonth()]} ${date.getFullYear()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function pickImage(sources, excludeUrls) {
  const counts = new Map;
  for (const s of sources) {
    if (!s.imageUrl)
      continue;
    if (excludeUrls && excludeUrls.has(s.imageUrl))
      continue;
    counts.set(s.imageUrl, (counts.get(s.imageUrl) ?? 0) + 1);
  }
  let common = null;
  let commonCount = 0;
  for (const [url, c] of counts) {
    if (c > commonCount) {
      common = url;
      commonCount = c;
    }
  }
  if (common && commonCount >= 2)
    return common;
  const sorted = [...sources].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  for (const s of sorted) {
    if (s.imageUrl && (!excludeUrls || !excludeUrls.has(s.imageUrl)))
      return s.imageUrl;
  }
  return null;
}
function buildUserPrompt(articleSources) {
  const blocks = articleSources.map((a, i) => {
    const parts = [
      `[Kaynak ${i + 1}: ${a.source.name}]`,
      `Başlık: ${a.title}`,
      a.description ? `Açıklama: ${a.description.slice(0, 800)}` : "",
      a.content ? `İçerik: ${a.content.slice(0, 4000)}` : ""
    ].filter(Boolean);
    return parts.join(`
`);
  });
  return `Aşağıda aynı haberi farklı kaynaklardan alınmış ${articleSources.length} ayrı RSS metni var. Bunları okuyarak:

1. Haberin başlığını ~6-10 kelimelik Türkçe bir başlık olarak YENİ yaz (kaynak başlıklarını birebir kopyalama).
2. Haberin özetini EN AZ 150, EN FAZLA 300 KELİME olarak kendi cümlelerinle yaz.
3. Haberin kategorisini aşağıdaki 6 kategoriden biriyle belirle:
   - "Güncel" (genel haberler, siyaset, toplum)
   - "Kamu / Resmi" (devlet, kurum, resmi açıklamalar, memur, atama)
   - "Ekonomi / Finans" (ekonomi, borsa, döviz, finans, şirket)
   - "Spor / Magazin" (spor, magazin, ünlüler)
   - "Bilim / Teknoloji" (bilim, teknoloji, yapay zeka, internet)
   - "Kültür / Sanat" (kültür, sanat, müzik, sinema, edebiyat)

ÖNEMLİ KURALLAR:
- EN AZ 150 KELİME yaz. 150 kelimeden AZ yazma. EN FAZLA 300 kelime olmalı.
- Türkçe imla ve yazım kurallarına HARİCİ DİKKAT ET:
  * "kaza" (oluşan olay) vs "kazı" (arkeolojik) — doğru ek kullan (kazada, kazıda)
  * "ile", "için", "gibi" gibi ekler ayrı yazılır
  * "ki" eki çoğu durumda bitişik yazılır (kişi, amaçki → ama bağlaç olan ki ayrı: "bilmem ki")
  * Yabancı dillerden gelen kelimelerde düzeltme işareti (â, î, û) kullan
  * Sayıların yazımı: 150 kelime değil yüz elli kelime gibi
- Cümlelerin kaynaklardaki cümlelerle BİREBİR AYNI OLMAMALIDIR — telif cezası almamak için paraphrase yap.
  * İSTİSNA: Kaynaklarda tırnak içinde verilen doğrudan alıntılar (kişilerin sözleri, açıklamaları) olduğu gibi korunabilir. Örnek: kaynakta "Sinem Dedetaş, 'Deniz Göktaş için iyi çocuktur üzüldüm' dedi" şeklinde geçiyorsa, bu alıntı cümlesi tırnak içinde aynen kullanılabilir. Sadece tırnak dışındaki anlatım paraphrase edilmeli.
- Sadece haberde geçen bilgileri kullan, dış bilgi ekleme, yargılama yapma.
- Haberin tüm önemli detaylarını ver: kim, ne, nerede, ne zaman, nasıl, neden sorularına cevap.
- Haberin arka planı, etkileri ve ilgili kişilerin açıklamalarını da ekle.
- Markdown formatı kullanma, başlık ve liste ekleme — düz metin ver.

Çıktı formatı (her satırı dahil et):
BAŞLIK: <yeni başlığın>
KATEGORİ: <6 kategoriden biri>
ÖZET: <en az 150, en fazla 300 kelimelik özet>

Kaynak metinler:
${blocks.join(`

---

`)}`;
}
var VALID_CATEGORIES = [
  "Güncel",
  "Kamu / Resmi",
  "Ekonomi / Finans",
  "Spor / Magazin",
  "Bilim / Teknoloji",
  "Kültür / Sanat"
];
function normalizeCategory(raw) {
  if (!raw)
    return "Güncel";
  const trimmed = raw.trim();
  for (const c of VALID_CATEGORIES) {
    if (trimmed.toLowerCase() === c.toLowerCase())
      return c;
  }
  const sorted = [...VALID_CATEGORIES].sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    if (trimmed.toLowerCase().includes(c.toLowerCase()))
      return c;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes("spor") || lower.includes("magazin") || lower.includes("ünlü"))
    return "Spor / Magazin";
  if (lower.includes("kamu") || lower.includes("resmi") || lower.includes("devlet") || lower.includes("memur") || lower.includes("atama"))
    return "Kamu / Resmi";
  if (lower.includes("ekonomi") || lower.includes("finans") || lower.includes("borsa") || lower.includes("döviz") || lower.includes("şirket"))
    return "Ekonomi / Finans";
  if (lower.includes("bilim") || lower.includes("teknoloji") || lower.includes("yapay zeka") || lower.includes("internet"))
    return "Bilim / Teknoloji";
  if (lower.includes("kültür") || lower.includes("sanat") || lower.includes("müzik") || lower.includes("sinema") || lower.includes("edebiyat"))
    return "Kültür / Sanat";
  return "Güncel";
}
function parseAIResponse(text) {
  const titleMatch = text.match(/BAŞLIK:\s*(.+?)(?:\n|$)/i);
  const categoryMatch = text.match(/KATEGORİ:\s*(.+?)(?:\n|$)/i);
  const summaryMatch = text.match(/ÖZET:\s*([\s\S]+?)(?:\n$|$)/i);
  if (!titleMatch || !summaryMatch) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length >= 2) {
      return { title: lines[0].slice(0, 120), summary: lines.slice(1).join(" ").trim() };
    }
    return null;
  }
  const title = titleMatch[1].trim();
  const summary = summaryMatch[1].trim();
  if (!title || !summary)
    return null;
  const category = categoryMatch ? normalizeCategory(categoryMatch[1]) : "Güncel";
  return { title: title.slice(0, 200), summary, category };
}
function countWords(s) {
  return s.split(/\s+/).filter(Boolean).length;
}
async function summarizeGroup(sources) {
  const sorted = [...sources].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const chosen = sorted.length > MAX_SOURCES_PER_GROUP ? sorted.slice(0, MAX_SOURCES_PER_GROUP) : sorted;
  if (chosen.length === 0)
    return null;
  const prompt = buildUserPrompt(chosen);
  const MAX_RETRIES = 2;
  const BASE_DELAY_MS = 15000;
  const WORD_COUNT_MIN = 150;
  let lastParsed = null;
  let lastWordCount = 0;
  for (let attempt = 0;attempt < MAX_RETRIES; attempt += 1) {
    try {
      const zai = await getZAI();
      const retryHint = attempt > 0 ? `

ÖNCEKİ YANITIN SADECE ${lastWordCount} KELİME İÇERİYORDU. Bu sefer MUTLAKA EN AZ 150 KELİME yaz.` : "";
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "Sen profesyonel bir Türkçe haber editörüsün. Verilen kaynakları okuyarak telif cezası almayacak şekilde özgün bir haber başlığı, kategori ve özet üretirsin. " + "ÖZET HER ZAMAN EN AZ 150 KELİME, EN FAZLA 300 KELİME OLMALIDIR — bu kurala kesinlikle uy. " + "KATEGORİ satırına 6 kategoriden birini yaz: Güncel, Kamu / Resmi, Ekonomi / Finans, Spor / Magazin, Bilim / Teknoloji, Kültür / Sanat. " + 'TÜRKÇE İMLA KURALLARINA DİKKAT ET: "kaza" (oluşan olay) ile "kazı" (arkeolojik) karıştırmamak, ekleri doğru kullanmak (kazada, kazıda), "ki" bağlacını doğru yazmak. ' + "Kaynak cümlelerini birebir kopyalama; paraphrase yap. ANCAK tırnak içindeki doğrudan alıntıları (kişilerin sözleri) tırnak içinde aynen koru. " + "Haberin tüm önemli detaylarını (kim, ne, ne zaman, nerede, nasıl, neden) ver. " + "Haberin arka planı, etkileri ve ilgili kişilerin açıklamalarını da ekle."
          },
          { role: "user", content: prompt + retryHint }
        ],
        thinking: { type: "disabled" },
        temperature: 0.6
      });
      const text = completion?.choices?.[0]?.message?.content ?? "";
      const parsed = parseAIResponse(text);
      if (!parsed) {
        return { title: "", summary: "", category: "Güncel", error: "AI yanıtı parse edilemedi" };
      }
      lastParsed = parsed;
      lastWordCount = countWords(parsed.summary);
      if (lastWordCount < WORD_COUNT_MIN && attempt < MAX_RETRIES - 1) {
        console.log(`  ⚠️ ${lastWordCount} kelime — kısa (min ${WORD_COUNT_MIN}), retry ${attempt + 2}/${MAX_RETRIES}`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS));
      return parsed;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429") && attempt < MAX_RETRIES - 1) {
        const waitMs = 30000 * (attempt + 1);
        console.log(`  429 rate limit — ${waitMs / 1000}s bekleniyor (deneme ${attempt + 2}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      return { title: "", summary: "", category: "Güncel", error: msg };
    }
  }
  if (lastParsed) {
    return lastParsed;
  }
  return { title: "", summary: "", category: "Güncel", error: "Maksimum deneme aşıldı" };
}
async function main() {
  const started = Date.now();
  console.log(`=== RSS Özet Pipeline ===
`);
  if (REBUILD_ONLY) {
    console.log("\uD83D\uDD27 REBUILD_ONLY modu — AI çağrısı yapılmıyor, DB'den dosya üretiliyor");
    const rows = await db.publishedArticle.findMany({
      where: { status: "published" },
      orderBy: { latestPublishedAt: "desc" }
    });
    console.log(`PublishedArticle: ${rows.length} kayıt`);
    const allArticles = await db.article.findMany({
      where: { id: { in: rows.flatMap((r) => {
        try {
          return JSON.parse(r.sourceArticleIds);
        } catch {
          return [];
        }
      }) } },
      include: { source: { select: { name: true, url: true } } }
    });
    const articleMap = new Map(allArticles.map((a) => [a.id, a]));
    const published2 = rows.map((r) => {
      let ids = [];
      try {
        ids = JSON.parse(r.sourceArticleIds);
      } catch {}
      const sourceArticleLinks = ids.map((id) => {
        const a = articleMap.get(id);
        return {
          title: a?.title ?? "",
          link: a?.link ?? "",
          source: a?.source.name ?? "",
          publishedAt: a?.publishedAt ?? new Date
        };
      });
      return {
        aiTitle: r.aiTitle,
        aiSummary: r.aiSummary,
        imageUrl: r.imageUrl,
        category: r.category,
        wordCount: r.wordCount,
        sourceArticleIds: ids,
        sourceArticleLinks,
        earliestPublishedAt: r.earliestPublishedAt,
        latestPublishedAt: r.latestPublishedAt,
        sourceCount: r.sourceCount
      };
    });
    await writeRssOzetFile(published2, started);
    return;
  }
  const articles = await db.article.findMany({
    where: { description: { not: null } },
    include: {
      source: { select: { id: true, name: true, url: true, category: true } }
    },
    orderBy: { publishedAt: "desc" }
  });
  console.log(`Toplam makale: ${articles.length}`);
  const withShingles = articles.map((a) => {
    const norm = normalize(`${a.description ?? ""} ${a.content ?? ""}`);
    const sh1 = shingles(norm, 1);
    const sh2 = shingles(norm, 2);
    return { article: a, sh1, sh2 };
  }).filter((x) => x.sh2.size > 0);
  console.log(`İşlenecek (sh2 > 0): ${withShingles.length}`);
  const inverted = new Map;
  for (let i = 0;i < withShingles.length; i += 1) {
    for (const sh of withShingles[i].sh2) {
      const arr = inverted.get(sh) ?? [];
      arr.push(i);
      inverted.set(sh, arr);
    }
  }
  const candidates = new Set;
  for (const [, idxs] of inverted) {
    if (idxs.length < 2)
      continue;
    for (let i = 0;i < idxs.length; i += 1) {
      for (let j = i + 1;j < idxs.length; j += 1) {
        const a = idxs[i];
        const b = idxs[j];
        if (withShingles[a].article.sourceId === withShingles[b].article.sourceId)
          continue;
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        candidates.add(key);
      }
    }
  }
  console.log(`Aday çift (farklı kaynaklar arası): ${candidates.size}`);
  const uf = new UnionFind(withShingles.length);
  let pairCount = 0;
  for (const key of candidates) {
    const [a, b] = key.split(",").map(Number);
    if (isSimilar(withShingles[a].sh1, withShingles[a].sh2, withShingles[b].sh1, withShingles[b].sh2)) {
      uf.union(a, b);
      pairCount += 1;
    }
  }
  console.log(`Benzer çift (sh2≥%${Math.round(SHINGLE2_THRESHOLD * 100)} VEYA sh1≥%${Math.round(SHINGLE1_THRESHOLD * 100)}): ${pairCount}`);
  const groupsMap = new Map;
  for (let i = 0;i < withShingles.length; i += 1) {
    const root = uf.find(i);
    const arr = groupsMap.get(root) ?? [];
    arr.push(i);
    groupsMap.set(root, arr);
  }
  const duplicateGroups = [];
  for (const group of groupsMap.values()) {
    const uniqueSources = new Set(group.map((i) => withShingles[i].article.sourceId));
    if (uniqueSources.size >= 2)
      duplicateGroups.push(group);
  }
  duplicateGroups.sort((a, b) => {
    const aSources = new Set(a.map((i) => withShingles[i].article.sourceId)).size;
    const bSources = new Set(b.map((i) => withShingles[i].article.sourceId)).size;
    if (aSources !== bSources)
      return bSources - aSources;
    const aMax = Math.max(...a.map((i) => withShingles[i].article.publishedAt.getTime()));
    const bMax = Math.max(...b.map((i) => withShingles[i].article.publishedAt.getTime()));
    return bMax - aMax;
  });
  console.log(`Tekrar eden haber grubu (>= 2 farklı kaynak): ${duplicateGroups.length}
`);
  const groupMetas = duplicateGroups.map((group) => {
    const sourcesInGroup = group.map((i) => withShingles[i].article);
    const bySource = new Map;
    for (const art of sourcesInGroup) {
      const arr = bySource.get(art.sourceId) ?? [];
      arr.push(art);
      bySource.set(art.sourceId, arr);
    }
    const allSources = Array.from(bySource.values()).flat();
    const repSource = allSources[0]?.source;
    const category = repSource?.category ?? "Güncel";
    const latestPublishedAt = new Date(Math.max(...allSources.map((a) => a.publishedAt.getTime())));
    const earliestPublishedAt = new Date(Math.min(...allSources.map((a) => a.publishedAt.getTime())));
    return {
      group,
      sourcesInGroup,
      bySource,
      allSources,
      category,
      latestPublishedAt,
      earliestPublishedAt,
      sourceCount: bySource.size
    };
  });
  const byCategoryMap = new Map;
  for (const gm of groupMetas) {
    const arr = byCategoryMap.get(gm.category) ?? [];
    arr.push(gm);
    byCategoryMap.set(gm.category, arr);
  }
  for (const arr of byCategoryMap.values()) {
    arr.sort((a, b) => b.latestPublishedAt.getTime() - a.latestPublishedAt.getTime());
  }
  const selectedGroups = [];
  for (const cat of CATEGORY_ORDER) {
    const arr = byCategoryMap.get(cat) ?? [];
    const limit = CATEGORY_LIMITS[cat];
    const selected = arr.slice(0, limit);
    selectedGroups.push(...selected);
    console.log(`  ${cat}: ${selected.length}/${arr.length} seçildi (limit ${limit})`);
  }
  console.log(`Toplam AI özetlenecek: ${selectedGroups.length}
`);
  const existingHashes = new Set;
  const existingTitles = [];
  const usedImageUrls = new Set;
  const existing = await db.publishedArticle.findMany({
    where: { status: { in: ["draft", "published", "stale"] } },
    select: {
      sourceArticleIds: true,
      status: true,
      id: true,
      aiTitle: true,
      aiSummary: true,
      imageUrl: true
    }
  });
  for (const d of existing) {
    existingHashes.add(d.sourceArticleIds);
    if (d.aiTitle) {
      const norm = normalize(d.aiTitle);
      existingTitles.push({
        title: d.aiTitle,
        sh1: shingles(norm, 1),
        sh2: shingles(norm, 2)
      });
    }
    if (d.imageUrl)
      usedImageUrls.add(d.imageUrl);
  }
  console.log(`Mevcut özet (draft+published+stale): ${existingHashes.size} (atlanacak/restore edilecek)`);
  console.log(`Mevcut başlık sayısı (benzerlik kontrolü için): ${existingTitles.length}`);
  console.log(`Mevcut görsel sayısı (görsel dedup için): ${usedImageUrls.size}`);
  function findSimilarExisting(title) {
    const norm = normalize(title);
    const sh1 = shingles(norm, 1);
    const sh2 = shingles(norm, 2);
    for (const e of existingTitles) {
      if (isSimilar(sh1, sh2, e.sh1, e.sh2)) {
        return { title: e.title, sh1: e.sh1, sh2: e.sh2 };
      }
    }
    return null;
  }
  const published = [];
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let restoredCount = 0;
  let autoPublishedBatches = 0;
  let draftCounter = 0;
  async function autoPublishDrafts() {
    const r = await db.publishedArticle.updateMany({
      where: { status: "draft" },
      data: { status: "published", publishedAt: new Date }
    });
    if (r.count > 0) {
      autoPublishedBatches += 1;
      console.log(`  \uD83D\uDCE4 Auto-publish (batch ${autoPublishedBatches}): ${r.count} haber yayınlandı`);
    }
    return r.count;
  }
  for (let gi = 0;gi < selectedGroups.length; gi += 1) {
    const gm = selectedGroups[gi];
    const sortedIds = [...gm.allSources.map((a) => a.id)].sort();
    const hash = JSON.stringify(sortedIds);
    if (existingHashes.has(hash)) {
      const existingRow = await db.publishedArticle.findFirst({
        where: { sourceArticleIds: hash, status: { in: ["draft", "published", "stale"] } }
      });
      if (existingRow) {
        if (existingRow.status === "stale") {
          await db.publishedArticle.update({
            where: { id: existingRow.id },
            data: { status: "published", publishedAt: new Date }
          });
          restoredCount += 1;
          console.log(`[${gi + 1}/${selectedGroups.length}] \uD83D\uDD04 Restore (stale → published): ${existingRow.aiTitle.slice(0, 50)}`);
        } else {
          skippedCount += 1;
          console.log(`[${gi + 1}/${selectedGroups.length}] ⏭️ Atlandı (zaten ${existingRow.status})`);
        }
        published.push({
          aiTitle: existingRow.aiTitle,
          aiSummary: existingRow.aiSummary,
          imageUrl: existingRow.imageUrl,
          category: existingRow.category,
          wordCount: existingRow.wordCount,
          sourceArticleIds: sortedIds,
          sourceArticleLinks: gm.allSources.map((a) => ({
            title: a.title,
            link: a.link,
            source: a.source.name,
            publishedAt: a.publishedAt
          })),
          earliestPublishedAt: gm.earliestPublishedAt,
          latestPublishedAt: gm.latestPublishedAt,
          sourceCount: gm.sourceCount
        });
      }
      continue;
    }
    const result = await summarizeGroup(gm.allSources);
    if (!result || result.error || !result.title || !result.summary) {
      errorCount += 1;
      console.log(`[${gi + 1}/${selectedGroups.length}] ⚠️ Atlandı: ${result?.error ?? "boş yanıt"}`);
      continue;
    }
    const similar = findSimilarExisting(result.title);
    if (similar) {
      skippedCount += 1;
      console.log(`[${gi + 1}/${selectedGroups.length}] ⏭️ Benzer başlık atlandı: "${result.title.slice(0, 50)}" ≈ "${similar.title.slice(0, 50)}"`);
      continue;
    }
    const wordCount = countWords(result.summary);
    if (wordCount < MIN_SUMMARY_WORDS - 30) {
      console.log(`[${gi + 1}/${selectedGroups.length}] ⚠️ Kısa özet (${wordCount} kelime) — yine de kaydedildi`);
    }
    const imageUrl = pickImage(gm.allSources, usedImageUrls);
    if (imageUrl) {
      usedImageUrls.add(imageUrl);
    } else {
      console.log(`[${gi + 1}/${selectedGroups.length}] \uD83D\uDDBC️ Görsel benzersiz seçilemedi (tüm alternatifler kullanımda) — görselsiz yayınlanacak`);
    }
    const newNorm = normalize(result.title);
    existingTitles.push({
      title: result.title,
      sh1: shingles(newNorm, 1),
      sh2: shingles(newNorm, 2)
    });
    const sourceArticleLinks = gm.allSources.map((a) => ({
      title: a.title,
      link: a.link,
      source: a.source.name,
      publishedAt: a.publishedAt
    }));
    const aiCategory = result.category ?? gm.category;
    try {
      await db.publishedArticle.create({
        data: {
          aiTitle: result.title,
          aiSummary: result.summary,
          imageUrl,
          category: aiCategory,
          wordCount,
          sourceArticleIds: hash,
          sourceCount: gm.sourceCount,
          earliestPublishedAt: gm.earliestPublishedAt,
          latestPublishedAt: gm.latestPublishedAt,
          status: "draft"
        }
      });
      draftCounter += 1;
    } catch (e) {
      console.log(`[${gi + 1}/${selectedGroups.length}] DB yazma hatası: ${e instanceof Error ? e.message : String(e)}`);
    }
    published.push({
      aiTitle: result.title,
      aiSummary: result.summary,
      imageUrl,
      category: aiCategory,
      wordCount,
      sourceArticleIds: sortedIds,
      sourceArticleLinks,
      earliestPublishedAt: gm.earliestPublishedAt,
      latestPublishedAt: gm.latestPublishedAt,
      sourceCount: gm.sourceCount
    });
    successCount += 1;
    console.log(`[${gi + 1}/${selectedGroups.length}] ✓ "${result.title.slice(0, 60)}" — ${wordCount} kelime, ${gm.sourceCount} kaynak, ${aiCategory}`);
    if (draftCounter >= 3) {
      await autoPublishDrafts();
      draftCounter = 0;
    }
  }
  if (draftCounter > 0) {
    await autoPublishDrafts();
  }
  console.log(`
Özetleme tamam: ${successCount} yeni AI özet, ${restoredCount} stale→published, ${skippedCount} atlandı, ${errorCount} hata, ${autoPublishedBatches} publish batch, ${((Date.now() - started) / 1000).toFixed(1)}s`);
  const finalSelection = published;
  for (const p of finalSelection) {
    if (!existingHashes.has(JSON.stringify(p.sourceArticleIds))) {}
  }
  await writeRssOzetFile(finalSelection, started);
}
async function writeRssOzetFile(finalSelection, started) {
  const lines = [];
  lines.push("# RSS Özet — Yeniden Yazılmış Haber Özetleri");
  lines.push("");
  lines.push("Birden fazla kaynakta çıkan haberler için AI tarafından telif güvenli (paraphrase) şekilde yeniden yazılmış başlık ve özetler.");
  lines.push("");
  lines.push(`- **Oluşturulma:** ${format(new Date, "d MMM yyyy HH:mm", { locale: tr })}`);
  lines.push(`- **Toplam özetlenen haber:** ${finalSelection.length}`);
  lines.push(`- **Kategori limitleri:** Güncel 10, Kamu 7, Ekonomi 7, Spor 5, Bilim 3, Kültür 3`);
  lines.push(`- **Kelime hedefi:** en az 100 kelime`);
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const cat of CATEGORY_ORDER) {
    const items = finalSelection.filter((p) => p.category === cat);
    lines.push(`## ${cat} (${items.length} haber)`);
    lines.push("");
    for (const p of items) {
      lines.push(`### ${p.aiTitle}`);
      lines.push("");
      lines.push(`- **Yayın aralığı:** ${fmtDate(p.earliestPublishedAt)} – ${fmtDate(p.latestPublishedAt)}`);
      lines.push(`- **Farklı kaynak sayısı:** ${p.sourceCount}`);
      lines.push(`- **Kelime sayısı:** ${p.wordCount}`);
      if (p.imageUrl) {
        lines.push(`- **Görsel:** ${p.imageUrl}`);
      }
      lines.push("");
      lines.push(`**Özet:**`);
      lines.push("");
      lines.push(p.aiSummary);
      lines.push("");
      lines.push("**Kaynaklar:**");
      lines.push("");
      for (let i = 0;i < p.sourceArticleLinks.length; i += 1) {
        const s = p.sourceArticleLinks[i];
        lines.push(`${i + 1}. [${s.title}](${s.link}) — ${s.source} — ${fmtDate(s.publishedAt)}`);
      }
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }
  lines.push("## Üretim Bilgisi");
  lines.push("");
  lines.push(`- **Oluşturan:** build-rss-ozet.ts`);
  lines.push(`- **Tarih:** ${new Date().toISOString()}`);
  lines.push(`- **Algoritma:** HİBRİT — 2-gram shingle Jaccard ≥ %${Math.round(SHINGLE2_THRESHOLD * 100)} VEYA 1-gram (kelime kümesi) Jaccard ≥ %${Math.round(SHINGLE1_THRESHOLD * 100)} + Union-Find + z-ai-web-dev-sdk paraphrase`);
  lines.push(`- **Çalışma süresi:** ${((Date.now() - started) / 1000).toFixed(1)} saniye`);
  lines.push("");
  import_node_fs.mkdirSync(import_node_path.default.dirname(OUTPUT_PATH), { recursive: true });
  import_node_fs.writeFileSync(OUTPUT_PATH, lines.join(`
`), "utf-8");
  const sizeKb = Math.round(lines.join(`
`).length / 1024 * 10) / 10;
  console.log(`
Dosya yazıldı: ${OUTPUT_PATH} (${sizeKb} KB, ${lines.length} satır)`);
}
main().catch((e) => {
  console.error("Pipeline hatası:", e);
  process.exit(1);
}).finally(async () => {
  await db.$disconnect();
});
