// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const { ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  ipcRenderer.on("lztInputs", (event, arg) => {
    // 1 - success autentification data is valid
    // 2 - erorr autentification data isn't valid
    // 3 - enter code from main
    // 4 - authentication finished
    switch (arg) {
      case "1":
        //logging in
        break;
      case "2":
        //wrong data
        break;
      case "3":
        document.getElementById("userDataLZT").style.display = "none";
        document.getElementById("authenticationCode").style.display = "block";
        document.getElementById("lztPanel").style.display = "none";
        break;
      case "4":
        document.getElementById("userDataLZT").style.display = "none";
        document.getElementById("authenticationCode").style.display = "none";
        document.getElementById("lztPanel").style.display = "block";
        break;
      case "5":
        document.getElementById("startAdsParse").disabled = false;
        break;
    }
  });

  ipcRenderer.on("funpayInputs", (event, arg) => {
    // 1 - logged in
    switch (arg) {
      case "1":
        document.getElementById("userDataFunPay").style.display = "none";
        document.getElementById("funpayPanel").style.display = "block";
        break;
      case "2":
        document.getElementById("").disabled = false;
        break;
    }
  });

  // receive message from main.js
  ipcRenderer.on("log", (event, arg) => {
    let logsData = document.getElementById("logsData");
    logsData.value = logsData.value + arg + "\n";
    const textarea = document.getElementById("logsData");
    textarea.scrollTop = textarea.scrollHeight;
  });

  document
    .querySelector("#startAdsParse")
    .addEventListener("click", function() {
      document.getElementById("startAdsParse").disabled = true;
      ipcRenderer.send("lztInputs", "1");
    });

  document.querySelector("#stopAdsParse").addEventListener("click", function() {
    ipcRenderer.send("stop", "1");
    document.getElementById("startAdsParse").style.display = "block";
    document.getElementById("stopAdsParse").style.display = "none";
  });

  document.querySelector("#lztLogIn").addEventListener("click", function() {
    let accData = {
      username: document.getElementById("lztUsername").value,
      password: document.getElementById("lztPassword").value
    };

    let logsData = document.getElementById("logsData");

    // send username to main.js
    ipcRenderer.send("userDataLZT", accData);

    logsData.value = "Start \n";

    document.querySelector("#sendCode").addEventListener("click", function() {
      let code = {
        code: document.getElementById("lztCode").value
      };
      ipcRenderer.send("code", code);
    });
  });

  document.querySelector("#funpayLogIn").addEventListener("click", function() {
    ipcRenderer.send("funpayLogIn");
  });
});
