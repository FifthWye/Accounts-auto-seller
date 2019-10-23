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
  //console.log("LZT re-auth date - " + lastLoginDate);
}

if (store.get("funpaylastLoginDate")) {
  funpaylastLoginDate = new Date(store.get("funpaylastLoginDate"));
  funpaylastLoginDate.setDate(funpaylastLoginDate.getDate() + 30);
  funpayCookiesAreValid = nowDate <= funpaylastLoginDate;
  //console.log("FunPay re-auth date - " + funpaylastLoginDate);
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
      headless: false
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
        headless: true //browser show / hide
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
      let newAccountsData = await parseAds(page, urlsArr);
      let accountsData;
      if (fs.existsSync("data.json")) {
        accountsData = JSON.parse(
          await fs.readFileSync("data.json", "utf8", function(err, data) {
            if (err) {
              throw err;
            }

            return data;
          })
        );

        newAccountsData = accountsData.concat(newAccountsData);
      }

      for (let i0 = 0; i0 < newAccountsData.length; i0++) {
        const selectedAccount = newAccountsData[i0];
        let objIndexes = [];

        for (let i1 = 0; i1 < newAccountsData.length; i1++) {
          if (i1 != i0) {
            if (newAccountsData[i1].steamUrl === selectedAccount.steamUrl) {
              objIndexes.push(i1);
            } else {
              if (newAccountsData[i1].lztUrl === selectedAccount.lztUrl) {
                objIndexes.push(i1);
              }
            }
          }
        }

        objIndexes.forEach(value => {
          newAccountsData = newAccountsData.slice(0, value);
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

  await page.goto(funpayMainUrl, {
    waitUntil: "networkidle2"
  });

  await page.setCookie(...puppeteerFPCookies);

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
  } else {
    event.sender.send("log", "There is no file with accounts data");
  }

  let accountsJson = JSON.parse(accountsData);

  let notValidAdsIndexes = [];
  let descriptions = [];

  for (let i = 0; i < accountsJson.length; i++) {
    if (await checkLolzAd(page, accountsJson[i].lztUrl)) {
      accountsJson[i].funpayPrice = calculatePrice(accountsJson[i]);

      desc = await funpayPublishAd(page, accountsJson[i]);

      descriptions.push(desc);

      accountsJson[i].funpayPublishDate = new Date();
    } else {
      notValidAdsIndexes.push(i);
    }
  }

  notValidAdsIndexes.forEach(value => {
    accountsJson = accountsJson.slice(0, value);
  });

  fs.writeFile(
    "desc.json",
    JSON.stringify(descriptions, null, 4),
    "utf8",
    function(err) {
      if (err) throw err;
    }
  );

  fs.writeFile(
    "data.json",
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

async function parseAds(page, ads) {
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

async function funpayEditPrice(page, url) {
  await page.goto(url, {
    waitUntil: "networkidle2"
  });

}

async function checkLolzAd(page, url) {
  await page.goto(url, {
    waitUntil: "networkidle2"
  });

  const buyButton = await page.$("a.marketViewItem--buyButton");

  if (buyButton) {
    await page.click("a.marketViewItem--buyButton"); //buy account

    //----Waiting for check button and click it if appears----

    let accountIsReadyToCheck = false;
    let errorDetails = false;

    while (!accountIsReadyToCheck) {
      try {
        await page.waitForSelector(".button.primary._checkAccountButton");
        accountIsReadyToCheck = true;
        await page.waitForSelector("div.errorDetails");
        errorDetails = true;
      } catch (error) {}
    }

    if (!errorDetails) {
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
        await page.waitForSelector("div.errorOverlay");
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
  }
  return false;
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

async function funpayPublishAd(page, accData) {
  const steamAccountsSell = "https://funpay.ru/lots/89/trade"; //steam accounts category

  if (!accData.funpayPublishDate) {
    //create ad on funpay
    await page.goto(steamAccountsSell, {
      waitUntil: "networkidle2"
    });

    await page.click("button.js-lot-raise");

    await page.click("button.js-lot-offer-edit");

    await page.waitForSelector("input.form-control.lot-field-input");

    let totalGames = "";
    if (accData.steamData.totalGames > 5) {
      totalGames = "⚡[Игр всего:" + accData.steamData.totalGames + "]";
    }

    let actualGamesTitles = "";
    if (accData.actualGames.length) {
      if (accData.actualGames.length == 1) {
        actualGamesTitles = accData.actualGames[0].game;
        if (accData.actualGames[0].hours > 100) {
          actualGamesTitles += " (" + accData.actualGames[0].hours + "ч.)";
        }
      } else if (accData.actualGames.length == 2) {
        actualGamesTitles =
          accData.actualGames[0].game + "/" + accData.actualGames[1].game;
      } else if (accData.actualGames.length >= 3) {
        actualGamesTitles =
          accData.actualGames[0].game +
          "/" +
          accData.actualGames[1].game +
          "/" +
          accData.actualGames[2].game +
          "...";
      }
    } else {
      if(accData.steamStatsP.length) {
        let noLimits = "";
        for(let i = 0; i < accData.steamStatsP.length; i++){
          if (accData.steamStatsP[i] === "There is no Friend & Trade limit") {
            noLimits = "NoLimit";
          }
        }
        actualGamesTitles += noLimits;
      }
      if(accData.steamData.steamLevel > 5) {
        actualGamesTitles += "[" + accData.steamData.steamLevel + "]"
      }

      
    if (accData.steamData.balance > 10) {
      actualGamesTitles += "[💵 Баланс:" + accData.steamData.balance + "]";
    }
      
    }

    //check if title consist of more than 100 characters

    let adTitle = totalGames + actualGamesTitles;

    if (adTitle.length > 100) {
      adTitle = adTitle.slice(0, 97) + "...";
    }

    await page.type("input.form-control.lot-field-input", adTitle);

    let steamBalance = "";
    if (accData.steamData.balance > 10) {
      steamBalance = " 💵 Баланс Steam - " + accData.steamData.balance + "\n";
    }

    let invArr = [];
    invArr.push(
      accData.steamData.csgoInventory,
      accData.steamData.dota2Inventory,
      accData.steamData.pubgInventory
    ); //adding all inventories to arr

    invArr = invArr.filter(Boolean); //removing NaN inventories

    const invPriceSum = await invArr.reduce((a, b) => a + b, 0); //sum elements

    let invPrice = "";
    if (invPriceSum > 10) {
      invPrice =
        "👖 Цена скинов,что можно продать, в инвентаре - " + invPriceSum + "\n";
    }

    let actualGames = "";
    if (accData.actualGames.length) {
      actualGames =
        "🔥 Популярных игр на аккаунте - " + accData.actualGames.length + "\n";
    }

    let hasVac = "";

    if (accData.steamStatsN) {

      for (let i = 0; i < accData.steamStatsN.length; i++) {
        if (accData.steamStatsN[i] === "There is VAC") {
          hasVac = "🔴 На аккаунте VAC\n";
        }
      }
    }

    let steamLvl = "🔶 Уровень Steam - " + accData.steamData.steamLvl + "\n";

    const steamDataDesc =
      steamLvl +
      "📆 Последняя активность - " +
      accData.steamData.lastActivity +
      "\n" +
      steamBalance +
      invPrice +
      actualGames +
      hasVac;

    const adDesc =
      "🔗 Steam профиль - " +
      accData.steamUrl +
      " чтоб посмотреть список игр добавьте - games/?tab=all к ссылке\n" +
      steamDataDesc;

    await page.type("textarea.form-control.lot-field-input", adDesc);

    const priceFunPay = "" + accData.funpayPrice;

    await page.type("input[name='price']", priceFunPay.toString());
    //await page.click("button.btn.btn-primary.js-btn-save");
    return adDesc;
  } else {
    //edit price
    return null;
  }
}
