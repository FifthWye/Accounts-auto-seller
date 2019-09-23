// Modules to control application life and create native browser window
const { app, BrowserWindow } = require("electron");
const path = require("path");
const $ = require("cheerio");
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
      mainWindow.webContents.send("lztInputs", "4");
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

const mainUrl = "https://lolzteam.net";
const marketPage = "/market"; //contests page
const loginUrl = "/login"; //login page

const maxPrice = 455;

const lztSettings = [
  {
    name: "Steam / last activity more than 5 days / seller priority",
    url: "/steam/?pmax=" + maxPrice + "&3_days=1&order_by=pdate_to_down",
    fullUrl: "https://lolzteam.net/market/steam/?3_days=1"
  }
];

let lztCookiesAreValid = false;

const puppeteerLZTCookies = store.get("puppeteerLZTCookies");
if (store.get("lastLoginDate")) {
  lastLoginDate = new Date(store.get("lastLoginDate"));
  lastLoginDate.setDate(lastLoginDate.getDate() + 14);
  nowDate = new Date();
  lztCookiesAreValid = nowDate <= lastLoginDate;
  console.log("Re-auth date - " + lastLoginDate);
}

let ads = [];

if (!lztCookiesAreValid) {
  store.clear();
  ipcMain.on("userDataLZT", async (event, arg) => {
    const username = arg.username; // arg.username;
    const password = arg.password; // arg.password;
    const browser2 = await puppeteer.launch({
      headless: true
    });

    const page = await browser2.newPage();
    await page.goto(mainUrl + loginUrl, {
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
        store.set("lastLoginDate", datetime);
        event.sender.send("lztInputs", "4");
        const cookies = await page.cookies();
        //console.log(cookies);
        store.set("puppeteerLZTCookies", cookies);
        event.sender.send("log", "Session is set now app is ready for use");
        browser2.close();
      });
    } catch (err) {
      event.sender.send("log", "Wrong user autentification data");
    }
  });
}

if (lztCookiesAreValid) {
  ipcMain.on("lztInputs", async (event, arg) => {
    event.sender.send("log", "Start");
    if (arg == 1) {
      const browser0 = await puppeteer.launch({
        headless: false //browser show / hide
      });
      event.sender.send("log", "Creating page to work with.");
      const page = await browser0.newPage();
      event.sender.send("log", "Setting page cookies");
      await page.setCookie(...puppeteerLZTCookies);
      event.sender.send(
        "log",
        "Downloading Home page to check if cookies are valid"
      );
      await page.goto(mainUrl, {
        waitUntil: "networkidle2"
      });
      event.sender.send("log", "Downloading market page");

      await page.goto(mainUrl + marketPage + lztSettings[0].url, {
        waitUntil: "networkidle2"
      });
      await page.click("#SubmitSearchButton");
      await page.waitForNavigation();
      let urlsArr = await getAdsUrls(page, 2); // getting ads urls
      console.log("lzt ads : " + urlsArr);
      urlsArr = await validateAds(page, urlsArr);
      console.log("All data : " + urlsArr);
      //here you should create ad on funpay
      await browser0.close();
      event.sender.send("lztInputs", "5");
      event.sender.send("log", "Finished all ads are parsed");
    } else if (arg >= 2 && arg <= 5) {
    }
  });
}

async function getAdsUrls(page, pagesAmount) {
  mainWindow.webContents.send("log", pagesAmount + " pages will be parsed");

  let adsUrls = [];

  for (let i = 0; i != pagesAmount; i++) {
    let newUrls = await page.evaluate(async () => {
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
        mainUrl + marketPage + lztSettings[0].url + "&page=" + pageNum,
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
    let obj = await page.evaluate(async () => {
      const lztPrice = document.getElementsByClassName("price").innerHTML;
      const mainDiv = document.getElementsByClassName(
        "marketContainer marketItemView--Container"
      );
      const $ = cheerio.load(mainDiv).attr("href");
      const steamUrl = $(a.fas.fa - external - link - alt.goIcon);
      const steamStats = $(".marketItevView--status .clear > div").text();
      console.log(steamStats);
      return {
        lztUrl: ads[i],
        lztPrice: parseInt(lztPrice),
        steamUrl: steamUrl,
        steamLvl: "lvl",
        steamBalance: "balance",
        steamGamesAmount: "amount",
        csgoRank: "rank",
        steamCsgoInvValue: "value",
        steamPubgInvValue: "value"
      };
    });

    adsData.push(obj);
  }
  return adsData;
}
