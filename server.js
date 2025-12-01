require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 解析天氣資料的共用函式
 */
const parseWeatherData = (locationData) => {
  const weatherElements = locationData.weatherElement;
  const timeCount = weatherElements[0].time.length;
  const forecasts = [];

  for (let i = 0; i < timeCount; i++) {
    const forecast = {
      startTime: weatherElements[0].time[i].startTime,
      endTime: weatherElements[0].time[i].endTime,
      weather: "",
      rain: "",
      minTemp: "",
      maxTemp: "",
      comfort: "",
      windSpeed: "",
    };

    weatherElements.forEach((element) => {
      const value = element.time[i].parameter;
      switch (element.elementName) {
        case "Wx":
          forecast.weather = value.parameterName;
          break;
        case "PoP":
          forecast.rain = value.parameterName + "%";
          break;
        case "MinT":
          forecast.minTemp = value.parameterName + "°C";
          break;
        case "MaxT":
          forecast.maxTemp = value.parameterName + "°C";
          break;
        case "CI":
          forecast.comfort = value.parameterName;
          break;
        case "WS":
          forecast.windSpeed = value.parameterName;
          break;
      }
    });

    forecasts.push(forecast);
  }

  return forecasts;
};

/**
 * 取得指定縣市天氣預報
 */
const getWeatherByCity = async (req, res) => {
  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    const { city } = req.params;

    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: city,
        },
      }
    );

    const locationData = response.data.records.location[0];

    if (!locationData) {
      return res.status(404).json({
        error: "查無資料",
        message: `無法取得 ${city} 天氣資料`,
      });
    }

    const weatherData = {
      city: locationData.locationName,
      updateTime: response.data.records.datasetDescription,
      forecasts: parseWeatherData(locationData),
    };

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
      });
    }

    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

/**
 * 取得全部縣市天氣預報
 */
const getAllCitiesWeather = async (req, res) => {
  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 臺灣各縣市列表
    const cities = [
      "基隆市",
      "臺北市",
      "新北市",
      "桃園市",
      "新竹縣",
      "新竹市",
      "苗栗縣",
      "臺中市",
      "彰化縣",
      "南投縣",
      "雲林縣",
      "嘉義縣",
      "嘉義市",
      "臺南市",
      "高雄市",
      "屏東縣",
      "宜蘭縣",
      "花蓮縣",
      "臺東縣",
      "金門縣",
      "澎湖縣",
      "連江縣",
    ];

    const allWeatherData = [];

    // 平行請求所有縣市的天氣資料
    const requests = cities.map((city) =>
      axios
        .get(`${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`, {
          params: {
            Authorization: CWA_API_KEY,
            locationName: city,
          },
        })
        .then((response) => {
          const locationData = response.data.records.location[0];
          if (locationData) {
            return {
              city: locationData.locationName,
              updateTime: response.data.records.datasetDescription,
              forecasts: parseWeatherData(locationData),
            };
          }
          return null;
        })
        .catch((error) => {
          console.warn(`取得 ${city} 天氣資料失敗:`, error.message);
          return null;
        })
    );

    const results = await Promise.all(requests);
    const validResults = results.filter((result) => result !== null);

    res.json({
      success: true,
      count: validResults.length,
      data: validResults,
    });
  } catch (error) {
    console.error("取得全部天氣資料失敗:", error.message);
    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API",
    endpoints: {
      allCities: "/api/weather/all",
      kaohsiung: "/api/weather/kaohsiung",
      city: "/api/weather/:city",
      health: "/api/health",
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 取得全部縣市天氣
app.get("/api/weather/all", getAllCitiesWeather);

// 取得高雄天氣（相容舊 API）
app.get("/api/weather/kaohsiung", (req, res) => {
  req.params.city = "高雄市";
  getWeatherByCity(req, res);
});

// 取得特定縣市天氣
app.get("/api/weather/:city", getWeatherByCity);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});
