"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
exports.__esModule = true;
var electron_1 = require("electron");
var electron_updater_1 = require("electron-updater");
var path = require("path");
var url = require("url");
var fs_1 = require("fs");
// tslint:disable-next-line:one-variable-per-declaration
var mainWindow, serve;
var args = process.argv.slice(1);
serve = args.some(function (val) { return val === '--serve'; });
var server = require('./dist/server');
var logger = require('electron-log');
var excelParser = new (require('simple-excel-to-json').XlsParser)();
function createWindow() {
    var electronScreen = electron_1.screen;
    var size = electronScreen.getPrimaryDisplay().workAreaSize;
    var autoUpdater = require('electron-updater').autoUpdater;
    // Create the browser window.
    mainWindow = new electron_1.BrowserWindow({
        x: 0,
        y: 0,
        // fullscreen: true,
        // title: PRODUCT_NAME,
        // icon: ctx.locations.icon,
        // show: false,
        // autoHideMenuBar: true,
        width: size.width,
        height: size.height,
        webPreferences: {
            nodeIntegration: true
        }
    });
    if (serve) {
        require('electron-reload')(__dirname, {
            electron: require(__dirname + "/node_modules/electron")
        });
        mainWindow.loadURL('http://localhost:4200');
    }
    else {
        mainWindow.loadURL(url.format({
            pathname: path.join(__dirname, 'dist/browser/index.html'),
            protocol: 'file:',
            slashes: true
        }));
    }
    if (serve) {
        mainWindow.webContents.openDevTools();
    }
    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store window
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });
}
try {
    // This method will be called when Electron has finished
    // initialization and is ready to create browser windows.
    // Some APIs can only be used after this event occurs.
    electron_1.app.on('ready', function () {
        if (process.platform === 'win32') {
            electron_1.app.setAppUserModelId('za.ac.nwu.PDF-Marker'); // set appId from package.json or electron-builder.yml?
        }
        createWindow();
        mainWindow.webContents.on('did-finish-load', function () {
            electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
        });
    });
    // Quit when all windows are closed.
    electron_1.app.on('window-all-closed', function () {
        // On OS X it is common for applications and their menu bar
        // to stay active until the user quits explicitly with Cmd + Q
        if (process.platform !== 'darwin') {
            electron_1.app.quit();
        }
    });
    electron_1.app.on('activate', function () {
        // On OS X it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (mainWindow === null) {
            createWindow();
        }
    });
    electron_1.ipcMain.on('app_version', function (event) {
        event.sender.send('app_version', { version: electron_1.app.getVersion() });
        logger.log('app_version: ' + electron_1.app.getVersion());
    });
    electron_updater_1.autoUpdater.on('update-available', function () {
        mainWindow.webContents.send('update_available');
        logger.log('update-available');
    });
    electron_updater_1.autoUpdater.on('update-downloaded', function () {
        mainWindow.webContents.send('update_downloaded');
        logger.log('update-downloaded');
    });
    electron_1.ipcMain.on('restart_app', function () {
        electron_updater_1.autoUpdater.quitAndInstall();
    });
    electron_updater_1.autoUpdater.on('error', function (err) {
        logger.error('AutoUpdater error');
        logger.error(err);
    });
    electron_1.ipcMain.on('get_app_version', function (event) {
        event.sender.send('on_get_app_version', { version: electron_1.app.getVersion() });
    });
    electron_1.ipcMain.on('open_external_link', function (event, args) {
        electron_1.shell.openExternal(args.resource).then(function () {
            event.sender.send('on_open_external_link', { results: true });
        })["catch"](function (reason) {
            event.sender.send('on_error', reason);
        });
    });
    electron_1.ipcMain.on('get_folder', function (event) {
        electron_1.dialog.showOpenDialog(mainWindow, {
            title: 'Select Folder',
            properties: ['openDirectory', 'promptToCreate']
        }).then(function (data) {
            if (data.canceled) {
                event.sender.send('on_get_folder', { selectedPath: null });
            }
            else {
                event.sender.send('on_get_folder', { selectedPath: data.filePaths[0] });
            }
        })["catch"]((function (reason) {
            event.sender.send('on_error', reason);
        }));
    });
    electron_1.ipcMain.on('get_file', function (event, args) {
        electron_1.dialog.showOpenDialog(mainWindow, {
            title: 'Select File',
            filters: [
                { name: args.name, extensions: args.extension }
            ],
            properties: ['openFile']
        }).then(function (data) {
            if (data.canceled) {
                event.sender.send('on_get_file', { selectedPath: null });
            }
            else {
                event.sender.send('on_get_file', { selectedPath: data.filePaths[0] });
            }
        })["catch"]((function (reason) {
            event.sender.send('on_error', reason);
        }));
    });
    // tslint:disable-next-line:no-shadowed-variable
    electron_1.ipcMain.on('get_excel_to_json', function (event, args) {
        electron_1.dialog.showOpenDialog(mainWindow, {
            title: 'Select File',
            filters: [
                { name: args.name, extensions: args.extension }
            ],
            properties: ['openFile']
        }).then(function (data) { return __awaiter(_this, void 0, void 0, function () {
            var doc, docInJSON, count_1, rubric_1, standardLevelCount;
            return __generator(this, function (_a) {
                if (data.canceled) {
                    event.sender.send('on_excel_to_json', { selectedPath: null, blob: null });
                }
                else {
                    doc = excelParser.parseXls2Json(data.filePaths[0], { isNested: true });
                    docInJSON = doc[0] || [];
                    if (docInJSON.length === 0) {
                        event.sender.send('on_excel_to_json', { selectedPath: data.filePaths[0], contents: JSON.stringify(docInJSON) });
                    }
                    else {
                        count_1 = 0;
                        rubric_1 = {
                            criterias: []
                        };
                        standardLevelCount = 0;
                        docInJSON.forEach(function (criteriaData) {
                            if (count_1 > 1) {
                                var levels = [];
                                for (var i = 1; i <= 4; i++) {
                                    var achievementMark = 'Achievement_level_' + i + '_mark';
                                    var achievementFeedback = 'Achievement_level_' + i + '_feedback';
                                    var achievementTitle = 'Achievement_level_' + i + '_title';
                                    var defaultLevels = {
                                        score: null,
                                        description: null,
                                        label: null
                                    };
                                    if (!isBlank(criteriaData[achievementMark]) &&
                                        !isBlank(criteriaData[achievementFeedback]) &&
                                        !isBlank(criteriaData[achievementTitle])) {
                                        levels[i - 1] = {
                                            score: criteriaData[achievementMark],
                                            description: criteriaData[achievementFeedback],
                                            label: criteriaData[achievementTitle]
                                        };
                                    }
                                    else {
                                        levels[i - 1] = defaultLevels;
                                    }
                                }
                                rubric_1.criterias.push({
                                    description: isBlank(criteriaData.Criterion_description) ? null : criteriaData.Criterion_description,
                                    name: isBlank(criteriaData.Criterion_name) ? null : criteriaData.Criterion_name,
                                    levels: levels
                                });
                            }
                            count_1++;
                        });
                        event.sender.send('on_excel_to_json', { selectedPath: data.filePaths[0], contents: JSON.stringify(rubric_1) });
                    }
                }
                return [2 /*return*/];
            });
        }); })["catch"]((function (reason) {
            event.sender.send('on_error', reason);
        }));
    });
    electron_1.ipcMain.on('save_file', function (event, args) {
        var filePath = electron_1.dialog.showSaveDialogSync(mainWindow, {
            defaultPath: args.filename,
            title: 'Save',
            filters: [
                { name: args.name, extensions: args.extension }
            ]
        });
        if (filePath) {
            try {
                fs_1.writeFileSync(filePath, new Buffer(args.buffer));
                event.sender.send('on_save_file', { selectedPath: filePath });
            }
            catch (e) {
                event.sender.send('on_error', e.message);
            }
        }
        else {
            event.sender.send('on_save_file', { selectedPath: null });
        }
    });
}
catch (e) {
    // Catch Error
    // throw e;
}
function isBlank(data) {
    return (data === '' || data === null || data === undefined);
}
