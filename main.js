// Modules to control application life and create native browser window
const { app, BrowserWindow } = require("electron");
const path = require("path");
var fs = require("fs");
const Store = require("electron-store");
const store = new Store();
const puppeteer = require("puppeteer");
const { ipcMain } = require("electron");

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 500,
    icon: path.join(__dirname, "assets/icons/png/64x64.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  //mainWindow.removeMenu();

  // and load the index.html of the app.
  mainWindow.loadFile("index.html");

  mainWindow.webContents.on("did-finish-load", function() {
    if (store.get("puppeteerLZTCookies")) {
      //console.log(store.get("puppeteerLZTCookies"));
      mainWindow.webContents.send("lztInputs", "4");
    }
    if (store.get("puppeteerFPCookies")) {
      //console.log(store.get("puppeteerFPCookies"));
      mainWindow.webContents.send("funpayInputs", "1");
    }
  });

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Emitted when the window is closed.
  mainWindow.on("closed", function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed.
app.on("window-all-closed", function() {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", function() {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) createWindow();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

//----Declaration of global variables----

const lztMainUrl = "https://lolzteam.net";
const lztMarketPage = "/market"; //contests page
const lztLoginUrl = "/login"; //login page
const funpayMainUrl = "https://funpay.ru";
const funpayLoginUrl = "/account/login";

const maxPrice = 320;

const lztSettings = {
  name: "Steam / last activity more than 5 days / seller priority",
  url: "/steam/?pmax=" + maxPrice + "&3_days=1&order_by=pdate_to_down",
  fullUrl: "https://lolzteam.net/market/steam/?3_days=1"
};

let lztCookiesAreValid = false;

let funpayCookiesAreValid = false;

const puppeteerLZTCookies = store.get("puppeteerLZTCookies");

const puppeteerFPCookies = store.get("puppeteerFPCookies");

const nowDate = new Date();

//----Checking cookies for puppeteer----

if (store.get("lztlastLoginDate")) {
  lastLoginDate = new Date(store.get("lztlastLoginDate"));
  lastLoginDate.setDate(lastLoginDate.getDate() + 30);
  lztCookiesAreValid = nowDate <= lastLoginDate;
  console.log("LZT re-auth date - " + lastLoginDate);
}

if (store.get("funpaylastLoginDate")) {
  funpaylastLoginDate = new Date(store.get("funpaylastLoginDate"));
  funpaylastLoginDate.setDate(funpaylastLoginDate.getDate() + 30);
  funpayCookiesAreValid = nowDate <= funpaylastLoginDate;
  console.log("FunPay re-auth date - " + funpaylastLoginDate);
}

//----Logging in----

if (!lztCookiesAreValid) {
  ipcMain.on("userDataLZT", async (event, arg) => {
    const username = arg.username; // arg.username;
    const password = arg.password; // arg.password;
    const browser = await puppeteer.launch({
      headless: true
    });

    const page = await browser.newPage();
    await page.goto(lztMainUrl + lztLoginUrl, {
      waitUntil: "networkidle2"
    });

    //username
    await page.waitForSelector("[name='login']");
    await page.type("[name='login']", username);

    //password
    await page.keyboard.down("Tab");
    await page.keyboard.type(password);

    //we find the Login btn using the innerText comparison because the selector used for the btn might be unstable
    await page.evaluate(() => {
      let btns = [...document.querySelectorAll("input")];
      btns.forEach(function(btn) {
        if (btn.value == "Log in") btn.click();
      });
    });

    event.sender.send("log", "Trying to log in as " + username);

    try {
      await page.waitForSelector(".login_two_step", {
        timeout: 5000
      });
      event.sender.send("log", "Success. Please eneter code from email");
      event.sender.send("lztInputs", "3");
      await ipcMain.once("code", async (event, arg) => {
        let code = arg.code;
        await page.type("[name='code']", code);
        await page.click("[name='save']");
        await page.waitForSelector("#account-style");
        event.sender.send("log", "Success. Just logged in with code - " + code);
        const datetime = new Date();
        store.set("lztlastLoginDate", datetime);
        event.sender.send("lztInputs", "4");
        const cookies = await page.cookies();
        store.set("puppeteerLZTCookies", cookies);
        event.sender.send(
          "log",
          "LZT - Session is set now app is ready for use"
        );
        await browser.close();
      });
    } catch (err) {
      event.sender.send("log", "Wrong user autentification data");
    }
  });
}

if (!funpayCookiesAreValid) {
  ipcMain.on("funpayLogIn", async (event, arg) => {
    event.sender.send("log", "Please log in using your account on FunPay");
    const browser = await puppeteer.launch({
      headless: true
    });

    const page = (await browser.pages())[0];
    await page.goto(funpayMainUrl + funpayLoginUrl, {
      waitUntil: "networkidle2"
    });

    let loggedIn = false;

    while (!loggedIn) {
      try {
        await page.waitForSelector(
          "a[href='https://funpay.ru/account/logout']",
          {
            timeout: 60000
          }
        );
        loggedIn = true;
      } catch (error) {}
    }
    const datetime = new Date();
    store.set("funpaylastLoginDate", datetime);
    const cookies = await page.cookies();
    store.set("puppeteerFPCookies", cookies);
    event.sender.send("funpayInputs", "1");
    await browser.close();
    event.sender.send(
      "log",
      "FunPay - Session is set now app is ready for use"
    );
  });
}

//----Main----

if (lztCookiesAreValid) {
  ipcMain.on("lztInputs", async (event, arg) => {
    event.sender.send("log", "Start");
    if (arg == 1) {
      const browser = await puppeteer.launch({
        headless: false //browser show / hide
      });
      event.sender.send("log", "Creating page to work with.");
      const page = await browser.newPage();
      event.sender.send("log", "Setting page cookies");
      await page.setCookie(...puppeteerLZTCookies);
      event.sender.send(
        "log",
        "Downloading Home page to check if cookies are valid"
      );

      await page.goto(lztMainUrl, {
        waitUntil: "networkidle2"
      });

      event.sender.send("log", "Downloading market page");

      await page.goto(lztMainUrl + lztMarketPage + lztSettings.url, {
        waitUntil: "networkidle2"
      });
      await page.click("#SubmitSearchButton");
      await page.waitForNavigation();
      let urlsArr = await getAdsUrls(page, 1); // getting ads urls
      console.log("lzt ads : " + urlsArr);
      let newAccountsData = await validateAds(page, urlsArr);
      let accountsData;
      if (fs.existsSync("data.json")) {
        accountsData = await fs.readFileSync("data.json", "utf8", function(
          err,
          data
        ) {
          if (err) {
            throw err;
          }

          return data;
        });
      }

      fs.writeFile(
        "data.json",
        JSON.stringify(newAccountsData, null, 4),
        "utf8",
        function(err) {
          if (err) throw err;
        }
      );

      console.log("All data : " + JSON.stringify(newAccountsData, null, 4));
      await browser.close();
      event.sender.send("lztInputs", "5");
      event.sender.send("log", "Finished all ads are parsed");
    } else if (arg >= 2 && arg <= 5) {
    }
  });
}

ipcMain.on("funpayInputs", async (event, arg) => {
  event.sender.send("log", "FunPay - Start publishing ads");
  const browser = await puppeteer.launch({
    headless: false
  });

  const page = (await browser.pages())[0];
  await page.goto(lztMainUrl, {
    waitUntil: "networkidle2"
  });

  await page.setCookie(...puppeteerLZTCookies);

  await page.goto(lztMainUrl, {
    waitUntil: "networkidle2"
  });

  let accountsData;
  if (fs.existsSync("dataWithPrices.json")) {
    accountsData = await fs.readFileSync(
      "dataWithPrices.json",
      "utf8",
      function(err, data) {
        if (err) {
          throw err;
        }

        return data;
      }
    );
  } else {
    event.sender.send("log", "There is no file with accounts data");
  }

  let accountsJson = JSON.parse(accountsData);

  for (let i = 0; i < accountsJson.length; i++) {
    if (await checkLolzAd(page, accountsJson[i].lztUrl)) {
      if (!accountsJson[i].funpayPrice) {
        accountsJson[i].funpayPrice = calculatePrice(accountsJson[i]);
        accountsJson[i].funpayPublishDate = new Date();
      } else {
        accountsJson[i].funpayPrice = calculatePrice(accountsJson[i]);
      }
    }
  }

  fs.writeFile(
    "dataWithPrices.json",
    JSON.stringify(accountsJson, null, 4),
    "utf8",
    function(err) {
      if (err) throw err;
    }
  );

  await browser.close();
  event.sender.send("log", "FunPay - Finished publishing");
  event.sender.send("funpayInputs", "2");
});

//----Sub functions----

async function getAdsUrls(page, pagesAmount) {
  mainWindow.webContents.send("log", pagesAmount + " pages will be parsed");

  let adsUrls = [];

  for (let i = 0; i != pagesAmount; i++) {
    let newUrls = await page.evaluate(() => {
      let pageUrls = [];
      let mainDiv = document.getElementsByClassName(
        "marketIndex--itemsContainer _marketIndex--itemsContainer marketIndex--Items"
      );

      $("a.marketIndexItem--Title", mainDiv).each(function() {
        var url = $(this).attr("href");
        let fullLink = "https://lolzteam.net/" + url;
        pageUrls.push(fullLink);
      });

      return pageUrls;
    });
    adsUrls = adsUrls.concat(newUrls);
    if (i != 0) {
      const pageNum = i + 1;
      await page.goto(
        lztMainUrl + lztMarketPage + lztSettings.url + "&page=" + pageNum,
        {
          waitUntil: "networkidle2"
        }
      );
    }
  }
  return adsUrls;
}

async function validateAds(page, ads) {
  mainWindow.webContents.send("log", "Ads amount - " + ads.length);

  //object example - {lztUrl:"url", lztPrice:"price", steamUrl:"url", steamLvl:"lvl", steamBalance:"balance", steamGamesAmount:"amount", csgoRank:"rank", steamCsgoInvValue:"value", steamPubgInvValue:"value",}

  let adsData = [];

  for (let i = 0; i < ads.length; i++) {
    await page.goto(ads[i], {
      waitUntil: "networkidle2"
    });

    const checkForWarning = await page.$(
      ".market--container.messageText.market_fishing_account_warning_page"
    );

    if (checkForWarning) {
      await page.click("label");
      await page.click(".button.red");
    }

    try {
      let obj = await page.evaluate(() => {
        const lztPrice = $("span.price").text();
        const steamUrl = $("span.data").text();

        const steamStatsP = [];
        $(".marketItevView--status.clear")
          .find("div.statusTitle")
          .each(function() {
            const innerText = $(this).text();
            steamStatsP.push(innerText);
          });

        const steamStatsN = [];
        $(".marketItevView--status.ban")
          .find("div.statusTitle")
          .each(function() {
            const innerText = $(this).html();
            steamStatsN.push(innerText);
          });

        const actualGamesExists = $("ul.body").length;
        const actualGames = [];
        console.log(actualGamesExists);
        if (actualGamesExists) {
          $("li.item").each(function() {
            let obj = {};
            let game = $(this)
              .find("div.fl_l.bold.gameTitle")
              .text();
            game = game.replace(/:/g, "");
            game = game.replace(/\n/g, "");
            game = game.replace(/\t/g, "");
            game = game.trim();
            if (!(game == "")) {
              const hours = $(this)
                .find("div.gameHoursPlayed")
                .text();
              obj.game = game;
              obj.hours = parseInt(hours);
              actualGames.push(obj);
            }
          });
        }

        let steamData = {};

        $("div.counter").each(function() {
          let key = $(this)
            .find("div.muted")
            .text();

          key = key.replace(/:/g, "");
          key = key.replace(/\n/g, "");
          key = key.replace(/\t/g, "");
          key = key.replace("CSGO", "csgo");
          key = key.replace("PUBG", "pubg");

          key = key.toLowerCase();
          let words = key.split(" ");
          key = "";
          for (let i = 0; i < words.length; i++) {
            if (i == 0) {
              words[i] = words[i].charAt(0).toLowerCase() + words[i].slice(1);
            } else if (i != 0) {
              words[i] = words[i].charAt(0).toUpperCase() + words[i].slice(1);
            }
            key += words[i];
          }

          let value = $(this)
            .find("div:not(.muted)")
            .text();

          value = value.replace(/\n/g, "");
          value = value.replace(/\t/g, "");

          if (key == "balance") {
            steamData[key] = parseInt(value) ? parseInt(value) : 0;
          } else if (key == "steamLevel") {
            steamData[key] = parseInt(value);
          } else if (key == "totalGames") {
            steamData[key] = parseInt(value);
          } else if (key == "pubgInventory") {
            steamData[key] = parseInt(value);
          } else if (key == "csgoInventory") {
            steamData[key] = parseInt(value);
          } else if (key == "dota2Inventory") {
            steamData[key] = parseInt(value);
          } else if (key == "country") {
            if ((value = "╨á╨╛╤ü╤ü╨╕╤Å")) steamData[key] = "Russian Federation";
          } else {
            steamData[key] = value;
          }
        });

        let obj = {};
        obj.lztPrice = parseInt(lztPrice);
        obj.steamUrl = steamUrl;
        obj.steamData = steamData;
        obj.actualGames = actualGames;
        if (steamStatsP.length) {
          obj.steamStatsP = steamStatsP;
        }
        if (steamStatsN.length) {
          obj.steamStatsN = steamStatsN;
        }

        return obj;
      });
      obj.lztUrl = ads[i];
      adsData.push(obj);
    } catch (error) {}
  }
  return adsData;
}

async function checkLolzAd(page, url) {
  await page.goto(url, {
    waitUntil: "networkidle2"
  });

  const buyButton = await page.$("a.marketViewItem--buyButton");

  if (buyButton) {
    await page.click("a.marketViewItem--buyButton"); //buy account

    //----Waiting for check button and clicl it if appears----

    let accountIsReadyToCheck = false;

    while (!accountIsReadyToCheck) {
      try {
        await page.waitForSelector(".button.primary._checkAccountButton", {
          timeout: 25000
        });
        accountIsReadyToCheck = true;
      } catch (error) {}
    }

    await page.click(".button.primary._checkAccountButton");

    //----Checking if there is no error in closest 10 sec than account valid----

    let accountChecked = false;

    let checkingProcess = true;
    while (checkingProcess) {
      const loaderIsHidden = await page.evaluate(() => {
        let loader = document.querySelector("._itemBuySpinner").style.display;
        if (loader == "none") {
          return false;
        } else {
          return true;
        }
      });
      checkingProcess = loaderIsHidden;
    }

    try {
      await page.waitForSelector("div.errorOverlay", {
        timeout: 5000
      });
    } catch (error) {
      //----Waiting for refund button and click if appears----

      while (!accountChecked) {
        try {
          await page.waitForSelector("a._refundAccountButton", {
            timeout: 25000
          });
          accountChecked = true;
        } catch (error) {}
      }

      if (accountChecked) {
        await page.click("a._refundAccountButton");
        await page.waitForNavigation();
        return true;
      } else {
        return false;
      }
    }
    return false;
  } else {
    return false;
  }

  return true;
}

function calculatePrice(accData) {
  const half = accData.lztPrice / 2;
  let price;
  price = accData.lztPrice * 3;
  if (accData.funpayPublishDate) {
    console.log(
      "already published - " +
        new Date(accData.funpayPublishDate) +
        " current date - " +
        new Date()
    );

    let publishDatePlusPeriod = new Date(accData.funpayPublishDate);
    publishDatePlusPeriod.setHours(publishDatePlusPeriod.getHours() + 36); //getting date of publish + 36 hours
    const oneAndHalfDayPassed = publishDatePlusPeriod < new Date(); //checking if current date is higher

    console.log(
      "Date when it will be 36 hours after publish - " + publishDatePlusPeriod
    );
    console.log("36 h - " + oneAndHalfDayPassed);

    if (accData.funpayPrice != accData.lztPrice + half) {
      const priceMinusHalf = accData.funpayPrice - half;
      if (oneAndHalfDayPassed) {
        const priceOnceMinusHalfThrice = accData.lztPrice * 3 - half * 3;
        if (accData.funpayPrice != priceOnceMinusHalfThrice) {
          price = accData.funpayPrice - half;
        } else {
          price = accData.funpayPrice;
        }
      } else {
        publishDatePlusPeriod = new Date(accData.funpayPublishDate);
        publishDatePlusPeriod.setHours(publishDatePlusPeriod.getHours() + 24);
        const oneDayPassed = publishDatePlusPeriod < new Date();
        console.log(
          "Date when it will be 24 hours after publish - " +
            publishDatePlusPeriod
        );
        console.log("24 h - " + oneDayPassed);
        if (oneDayPassed) {
          const priceOnceMinusHalfTwice = accData.lztPrice * 3 - half * 2;
          if (accData.funpayPrice != priceOnceMinusHalfTwice) {
            price = accData.funpayPrice - half;
          } else {
            price = accData.funpayPrice;
          }
        } else {
          publishDatePlusPeriod = new Date(accData.funpayPublishDate);
          publishDatePlusPeriod.setHours(publishDatePlusPeriod.getHours() + 12);
          const halfOfDayPassed = publishDatePlusPeriod < new Date();
          console.log(
            "Date when it will be 12 hours after publish - " +
              publishDatePlusPeriod
          );
          console.log("12 h - " + halfOfDayPassed);
          if (halfOfDayPassed) {
            const priceOnceMinusHalf = accData.lztPrice * 3 - half;
            if (accData.funpayPrice != priceOnceMinusHalf) {
              price = accData.funpayPrice - half;
            } else {
              price = accData.funpayPrice;
            }
          }
        }
      }
    } else {
      price = accData.funpayPrice;
    }
  }
  return price;
}
