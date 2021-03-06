/**
 * *** NOTE ON IMPORTING FROM ANGULAR AND NGUNIVERSAL IN THIS FILE ***
 *
 * If your application uses third-party dependencies, you'll need to
 * either use Webpack or the Angular CLI's `bundleDependencies` feature
 * in order to adequately package them for use on the server without a
 * node_modules directory.
 *
 * However, due to the nature of the CLI's `bundleDependencies`, importing
 * Angular in this file will create a different instance of Angular than
 * the version in the compiled application code. This leads to unavoidable
 * conflicts. Therefore, please do not explicitly import from @angular or
 * @nguniversal in this file. You can export any needed resources
 * from your application's main.server.ts file, as seen below with the
 * import for `ngExpressEngine`.
 */

import 'zone.js/dist/zone-node';

import * as express from 'express';
import {basename, dirname, join, sep} from 'path';
import {
  access,
  accessSync,
  constants,
  copyFileSync,
  createReadStream,
  existsSync,
  mkdir,
  mkdirSync,
  readdirSync,
  readFile,
  readFileSync,
  statSync,
  unlinkSync,
  writeFile,
  writeFileSync,
  rmdirSync, lstatSync
} from 'fs';
import {json2csv, json2csvAsync} from "json-2-csv";
import {PageSizes, PDFDocument, PDFPage, rgb} from 'pdf-lib';
import {AnnotationFactory} from 'annotpdf';
import {IconTypeEnum} from "./src/app/modules/pdf-marker/info-objects/icon-type.enum";
import {IconSvgEnum} from "./src/app/modules/pdf-marker/info-objects/icon-svg.enum";
import {IRubric, IRubricName} from "./src/app/modules/application/core/utils/rubric.class";
import {AssignmentSettingsInfo} from "./src/app/modules/pdf-marker/info-objects/assignment-settings.info";

const zipDir = require('zip-dir');
var JSZip = require("jszip");
const unzipper = require('unzipper');
const etl = require('etl');

const {check, validationResult} = require('express-validator');
const multer = require('multer');
const glob = require('glob');
const csvtojson = require('csvtojson');
const hexRgb = require('hex-rgb');
const pathinfo = require('locutus/php/filesystem/pathinfo');
const wrap = require('word-wrap');


const CONFIG_FILE = 'config.json';
const SETTING_FILE = '.settings.json';
const MARK_FILE = '.marks.json';
const GRADES_FILE = 'grades.csv';
const RUBRICS_FILE = 'rubrics.json';
const SUBMISSION_FOLDER = 'Submission attachment(s)';
const FEEDBACK_FOLDER = 'Feedback Attachment(s)';
const CONFIG_DIR = process.env.APPDATA + sep + 'pdf-config' + sep;
const UPLOADS_DIR = '.' + sep + 'uploads';

/*COMMON MESSAGES*/
const INVALID_RUBRIC_JSON_FILE = "Rubric file is not a valid JSON file!";
const COULD_NOT_CREATE_RUBRIC_FILE = "Failed to read rubric file!";
const COULD_NOT_READ_RUBRIC_LIST = "Could not read list of rubrics!";
const NOT_PROVIDED_RUBRIC = "Rubric must be provided!";
const FORBIDDEN_RESOURCE = "Forbidden access to resource!";
const COULD_NOT_CREATE_CONFIG_DIRECTORY = "Failed to create configuration directory!";
const NOT_CONFIGURED_CONFIG_DIRECTORY = "Configure default location to extract files to on the settings page!";
const EXTRACTED_ZIP = "Successfully extracted assignment to default folder!";
const EXTRACTED_ZIP_BUT_FAILED_TO_WRITE_TO_RUBRIC = "Successfully extracted assignment to default folder! But Failed to write to rubrics file!";
const NOT_PROVIDED_ASSIGNMENT_LOCATION = "Assignment location not provided!";
const INVALID_PATH_PROVIDED = "Invalid path provided!";
const INVALID_STUDENT_FOLDER = "Invalid student folder";
/**/

const assignmentList = (callback) => {
  readFile(CONFIG_DIR + CONFIG_FILE, (err, data) => {
    if (err)
      return [];

    if (!isJson(data))
      return [];

    const config = JSON.parse(data.toString());
    const folderModels = [];
    try {
      const folders: string[] = readdirSync(config.defaultPath);
      const folderCount = folders.length;
      if (folders.length) {
        folders.forEach(folder => {
          const files = glob.sync(config.defaultPath + '/' + folder + '/**');
          files.sort((a, b) => (a > b) ? 1 : -1);
          folderModels.push(hierarchyModel(files, config.defaultPath));
          if (folderModels.length == folderCount)
            callback(null, folderModels);
        })
      } else {
        callback(null, folderModels);
      }
    } catch (e) {
      callback(null, folderModels);
    }
  });
};

// Express server
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4200;
const DIST_FOLDER = join(process.cwd(), 'dist/browser');

// * NOTE :: leave this as require() since this file is built Dynamically from webpack
const {AppServerModuleNgFactory, LAZY_MODULE_MAP, ngExpressEngine, provideModuleMap} = require('./dist/server/main');

// Our Universal express-engine (found @ https://github.com/angular/universal/tree/master/modules/express-engine)
app.engine('html', ngExpressEngine({
  bootstrap: AppServerModuleNgFactory,
  providers: [
    provideModuleMap(LAZY_MODULE_MAP),
    {provide: 'ASSIGNMENT_LIST', useValue: assignmentList}
  ]
}));

app.set('view engine', 'html');
app.set('views', DIST_FOLDER);

// Example Express Rest API endpoints
// app.get('/api/**', (req, res) => { });
// Serve static files from /browser
app.get('*.*', express.static(DIST_FOLDER, {
  maxAge: '1y'
}));


const store = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!existsSync(UPLOADS_DIR)) {
      mkdir(UPLOADS_DIR, err => cb(err, UPLOADS_DIR));
    } else {
      cb(null, UPLOADS_DIR)
    }
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const uploadFiles = multer({storage: store}).any();
const uploadFile = multer({storage: store}).single('file');

/*HELPER FUNCTIONS*/
const readFromFile = (req, res, filePath: string, callback = null, errorMessage: string = null) => {
  return readFile(filePath, (err, data) => {
    if (err)
      return sendResponse(req, res, 500, (errorMessage) ? errorMessage:err.message);

    if (callback && isFunction(callback))
      callback(data);
  })
};

const writeToFile = (req, res, filePath: string, data: Uint8Array | string, customSuccessMsg: string = null, customFailureMsg: string = null, callback = null) => {
  writeFile(filePath, data, (err) => {
    if (err)
      return sendResponse(req, res, 500, (customFailureMsg) ? customFailureMsg : err.message);

    if (callback && isFunction(callback))
      callback();
    else
      return sendResponse(req, res, 200, (customSuccessMsg) ? customSuccessMsg : 'Successfully saved to file!');
  });
};

const checkAccess = (req, res, filePath: string, callback = null) => {
  return access(filePath, constants.F_OK, (err) => {
    if (err)
      return sendResponse(req, res, 404, err.message);

    if (callback && isFunction(callback))
      callback();
  });
};

const checkClient = (req, res) => {
  return (req.headers.client_id && req.headers.client_id === "PDF_MARKER");
};

const isFunction = (functionToCheck) => {
  return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
};

const isNullOrUndefined = (object: any): boolean => {
  return (object === null || object === undefined);
};

const isNullOrUndefinedOrEmpty = (object: string): boolean => {
  return (object === null || object === undefined || object === "");
};
/*END HELPER FUNCTIONS*/

const settingsPost = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  const errors = validationResult(req);
  if (!errors.isEmpty())
    return sendResponseData(req, res, 400, {errors: errors.array()});

  return checkAccess(req, res, req.body.defaultPath, () => {
    const data = new Uint8Array(Buffer.from(JSON.stringify(req.body)));
    return writeToFile(req, res, CONFIG_DIR + CONFIG_FILE, data);
  });
};

app.post('/api/settings', [
  check('lmsSelection').not().isEmpty().withMessage('LMS type not provided!'),
  check('defaultPath').not().isEmpty().withMessage('Default path not provided!')
], settingsPost);

const settingsGet = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  if (!existsSync(CONFIG_DIR)) {
    mkdir(CONFIG_DIR, err => {
      if (err)
        return sendResponse(req, res, 500, COULD_NOT_CREATE_CONFIG_DIRECTORY);
      return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
        if (!isJson(data))
          return sendResponseData(req, res, 200, {});
        else
          return sendResponseData(req, res, 200, data.toString());
      });
    });
  } else {
    return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
      if (!isJson(data))
        return sendResponseData(req, res, 200, {});
      else
        return sendResponseData(req, res, 200, data.toString());
    });
  }
};

app.get('/api/settings', settingsGet);

/*IMPORT API*/

const zipFileUploadCallback = (req, res, data) => {
  const acceptedParams = ["file", "noRubric", "rubric"];
  const receivedParams = Object.keys(req.body);
  let isInvalidKey: boolean = false;
  let invalidParam: string;

  for (let receivedParam of receivedParams) {
    if (acceptedParams.indexOf(receivedParam) == -1) {
      isInvalidKey = true;
      invalidParam = receivedParam;
      break;
    }
  }

  if (isInvalidKey)
    return sendResponse(req, res, 400, `Invalid parameter ${invalidParam} found in request`);

  if(isNullOrUndefined(req.body.file))
    return sendResponse(req, res, 400, 'No file selected!');

  return readFromFile(req, res, req.body.file, (zipFile) => {
    const config = JSON.parse(data.toString());

    const isRubric: boolean = req.body.noRubric;
    let rubricName: string;
    let rubric: IRubric = null;
    let rubricIndex: number;
    let rubrics: IRubric[];

    if (!isRubric) {
      if (isNullOrUndefined(req.body.rubric))
        return sendResponse(req, res, 400, NOT_PROVIDED_RUBRIC);

      rubricName = req.body.rubric.trim();
      if (!isNullOrUndefined(rubricName)) {
        try {
          const rubricData = readFileSync(CONFIG_DIR + RUBRICS_FILE);

          if (!isJson(rubricData))
            return sendResponse(req, res, 400, INVALID_RUBRIC_JSON_FILE);

          rubrics = JSON.parse(rubricData.toString());

          if (Array.isArray(rubrics)) {
            let index: number = -1;
            for (let i = 0; i < rubrics.length; i++) {
              if (rubrics[i].name === rubricName) {
                index = i;
                break;
              }
            }

            if (index != -1) {
              rubric = rubrics[index];
              rubricIndex = index;
            }
          } else {
            return sendResponse(req, res, 400, COULD_NOT_READ_RUBRIC_LIST);
          }
        } catch (e) {
          return sendResponse(req, res, 500, e.message);
        }
      }
    }

    const folders = glob.sync(config.defaultPath + '/*');

    let folderCount = 0;
    folders.forEach(folder => {
      if(isFolder(folder)) {
        folders[folderCount] = pathinfo(folder, 'PATHINFO_FILENAME');
        folderCount++;
      }
    });

    let zip = new JSZip();
    return zip.loadAsync(new Uint8Array(zipFile))
      .then((zipObject) => {
        let entry: string = "";
        zipObject.forEach((relativePath, zipEntry) => {
          if (entry === "") {
            entry = zipEntry.name;
          }
        });

        const entryPath = entry.split("/");
        if (entryPath.length > 0) {
          let newFolder;
          let oldPath = entryPath[0];
          let foundCount: number = 0;
          for (let i = 0; i < folders.length; i++) {
            if (oldPath.toLowerCase() + "/" === folders[i].toLowerCase() + "/")
              foundCount++;
            else if ((oldPath.toLowerCase() + " (" + (foundCount + 1) + ")" + "/") === folders[i].toLowerCase() + "/")
              foundCount++;
          }

          const settings: AssignmentSettingsInfo = {defaultColour: "#6F327A", rubric: rubric, isCreated: false};
          if (foundCount != 0) {
            newFolder = oldPath + " (" + (foundCount + 1) + ")" + "/";
            extractZipFile(req.body.file, config.defaultPath + sep, newFolder, oldPath + "/").then(() => {
              return writeToFile(req, res, config.defaultPath + sep + newFolder + sep + SETTING_FILE, JSON.stringify(settings),
                EXTRACTED_ZIP,
                null, () => {
                  if (!isNullOrUndefined(rubricName)) {
                    rubrics[rubricIndex].inUse = true;
                    return writeToFile(req, res, CONFIG_DIR + RUBRICS_FILE, JSON.stringify(rubrics),
                      EXTRACTED_ZIP,
                      EXTRACTED_ZIP_BUT_FAILED_TO_WRITE_TO_RUBRIC, null);
                  }
                  return sendResponse(req, res, 200, EXTRACTED_ZIP);
                });
            }).catch((error) => {
              if(existsSync(config.defaultPath + sep + newFolder))
                deleteFolderRecursive(config.defaultPath + sep + newFolder);
              return sendResponse(req, res, 501, error.message);
            });
          } else {
            extractZipFile(req.body.file, config.defaultPath + sep, "", "")
              .then(() => {
                return writeToFile(req, res, config.defaultPath + sep + oldPath + sep + SETTING_FILE, JSON.stringify(settings),
                  EXTRACTED_ZIP,
                  null, () => {
                    if (!isNullOrUndefined(rubricName)) {
                      rubrics[rubricIndex].inUse = true;
                      return writeToFile(req, res, CONFIG_DIR + RUBRICS_FILE, JSON.stringify(rubrics),
                        EXTRACTED_ZIP,
                        EXTRACTED_ZIP_BUT_FAILED_TO_WRITE_TO_RUBRIC, null);
                    }
                    return sendResponse(req, res, 200, EXTRACTED_ZIP);
                  });
              }).catch((error) => {
                if(existsSync(config.defaultPath + sep + oldPath))
                  deleteFolderRecursive(config.defaultPath + sep + oldPath);
                return sendResponse(req, res, 501, error.message);
              });
          }
        } else {
          return sendResponse(req, res, 501, "Zip Object contains no entries!");
        }
      })
      .catch(error => {
        return sendResponse(req, res, 501, error.message);
      });
  }, 'File not uploaded!');
};

const uploadFn = (req, res, next) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
    if (!isJson(data))
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

    return zipFileUploadCallback(req, res, data);
    /*return uploadFile(req, res, (err) => {
      return zipFileUploadCallback(req, res, data, err);
    });*/
  });
};

app.post('/api/import', uploadFn);

/*END IMPORT API*/

/*RUBRIC IMPORT API*/

const rubricFileUpload = (req, res, err) => {

  if (err)
    return sendResponseData(req, res, 501, {error: err});

  if (!req.file)
    return sendResponse(req, res, 404, 'No file uploaded!');

  const mimeTypes = ["application/json"];

  const rubricName = req.body.rubricName.trim();

  if (mimeTypes.indexOf(req.file.mimetype) == -1)
    return sendResponse(req, res, 400, 'Not a valid JSON file. Please select a file with a .json extension!');

  return readFile(UPLOADS_DIR + sep + req.file.originalname, (err, data) => {
    if (err) {
      return sendResponse(req, res, 500, COULD_NOT_CREATE_RUBRIC_FILE);
    }

    if (!isJson(data))
      return sendResponse(req, res, 400, INVALID_RUBRIC_JSON_FILE);

    const uploadedRubric: IRubric = JSON.parse(data.toString());
    // Read file contents of rubricFiles, if file does not exist, create one.
    // If file exists, get file contents, then append to it.
    if (!existsSync(CONFIG_DIR)) {
      mkdir(CONFIG_DIR, err => {
        if (err)
          return sendResponse(req, res, 500, COULD_NOT_CREATE_CONFIG_DIRECTORY);

        uploadedRubric.name = rubricName;
        return writeRubricFile(req, res, [uploadedRubric]);
      });
    } else {
      if (existsSync(CONFIG_DIR + RUBRICS_FILE)) {
        return readFile(CONFIG_DIR + RUBRICS_FILE, (err, data) => {
          if (err)
            return sendResponse(req, res, 500, 'Failed to read file containing list of rubrics!');

          if (!isJson(data))
            return sendResponse(req, res, 400, INVALID_RUBRIC_JSON_FILE);

          const rubrics: IRubric[] = JSON.parse(data.toString());
          if (Array.isArray(rubrics)) {
            let foundCount: number = 0;

            const clonedRubrics = [...rubrics];
            clonedRubrics.sort((a, b) => (a.name > b.name) ? 1 : -1);

            for (let i = 0; i < clonedRubrics.length; i++) {
              if (clonedRubrics[i].name.toLowerCase() === rubricName.toLowerCase())
                foundCount++;
              else if (clonedRubrics[i].name.toLowerCase() === (rubricName.toLowerCase() + " (" + (foundCount + 1) + ")"))
                foundCount++;
            }


            if (foundCount !== 0) {
              uploadedRubric.name = rubricName + " (" + (foundCount + 1) + ")";
            } else {
              uploadedRubric.name = rubricName;
            }

            rubrics.unshift(uploadedRubric);
            return writeRubricFile(req, res, rubrics);
          }

          return sendResponse(req, res, 400, COULD_NOT_READ_RUBRIC_LIST);
        })
      } else {
        uploadedRubric.name = rubricName;
        return writeRubricFile(req, res, [uploadedRubric]);
      }
    }
  });
};

const deleteUploadedFile = (req) => {
  if (req.file && existsSync(UPLOADS_DIR + sep + req.file.originalname))
    unlinkSync(UPLOADS_DIR + sep + req.file.originalname)
};

const deleteMultipleFiles = (req) => {
  if (req.files && req.files.length > 0) {
    for (let i = 0; i < req.files.length; i++) {
      if (req.files[i] && existsSync(UPLOADS_DIR + sep + req.files[i].originalname))
        unlinkSync(UPLOADS_DIR + sep + req.files[i].originalname);
    }
  }
};

const writeRubricFile = (req, res, rubricData: IRubric[]) => {
  return writeFile(CONFIG_DIR + RUBRICS_FILE, JSON.stringify(rubricData), (err) => {
    if (err) {
      return sendResponse(req, res, 500, COULD_NOT_CREATE_RUBRIC_FILE);
    }

    return getRubricNames(req, res, rubricData);
  });
};

const getRubricNames = (req, res, rubrics: IRubric[]) => {
  const rubricNames: IRubricName[] = [];
  if (Array.isArray(rubrics)) {
    rubrics.forEach(rubric => {
      const rubricName = {name: rubric.name, inUse: (rubric.inUse) ? rubric.inUse : false};
      rubricNames.push(rubricName);
    });
    return sendResponseData(req, res, 200, rubricNames);
  }

  return writeRubricFile(req, res, []);
};

const rubricUploadFn = async (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  return uploadFile(req, res, (err) => {
    if (err)
      return sendResponse(req, res, 500, "Error uploading rubric file");

    rubricFileUpload(req, res, err);
  });
};

app.post('/api/rubric/import', [
  check('rubricName').not().isEmpty().withMessage(NOT_PROVIDED_RUBRIC)
], rubricUploadFn);
/*END RUBRIC IMPORT API*/


/* READ RUBRICS */

const getRubricsFn = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  if (!existsSync(CONFIG_DIR)) {
    return mkdir(CONFIG_DIR, err => {
      if (err)
        return sendResponse(req, res, 500, COULD_NOT_CREATE_CONFIG_DIRECTORY);

      return writeRubricFile(req, res, []);
    });
  } else {
    if (existsSync(CONFIG_DIR + RUBRICS_FILE)) {
      return readFromFile(req, res, CONFIG_DIR + RUBRICS_FILE, (data) => {
        if (!isJson(data))
          return sendResponse(req, res, 400, INVALID_RUBRIC_JSON_FILE);

        const rubrics: IRubric[] = JSON.parse(data.toString());
        if (Array.isArray(rubrics))
          return sendResponseData(req, res, 200, rubrics);
        return writeRubricFile(req, res, []);
      })
    } else {
      return writeRubricFile(req, res, []);
    }
  }
};

app.get('/api/rubric/import', getRubricsFn);
/* END READ RUBRICS */

/*READ RUBRIC NAMES*/
const getRubricNamesFn = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  if (!existsSync(CONFIG_DIR)) {
    return mkdir(CONFIG_DIR, err => {
      if (err)
        return sendResponse(req, res, 500, COULD_NOT_CREATE_CONFIG_DIRECTORY);

      return writeRubricFile(req, res, []);
    });
  } else {
    if (existsSync(CONFIG_DIR + RUBRICS_FILE)) {
      return readFromFile(req, res, CONFIG_DIR + RUBRICS_FILE, (data) => {
        if (!isJson(data))
          return sendResponse(req, res, 400, INVALID_RUBRIC_JSON_FILE);

        const rubrics: IRubric[] = JSON.parse(data.toString());
        return getRubricNames(req, res, rubrics);
      });
    } else {
      return writeRubricFile(req, res, []);
    }
  }
};
app.get('/api/rubric/details', getRubricNamesFn);
/* END RUBRIC NAMES*/

/* DELETE RUBRICS */

const deleteRubricsFn = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  if (!req.body.rubricName)
    return sendResponse(req, res, 400, NOT_PROVIDED_RUBRIC);

  const rubricName: string = req.body.rubricName.trim();

  return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
    if (!isJson(data))
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

    const config = JSON.parse(data.toString());

    try {
      const folders: string[] = glob.sync(config.defaultPath + sep + "*");
      let found: boolean = false;
      folders.forEach(folder => {
        const settingFileContents = readFileSync(folder + sep + SETTING_FILE);

        if (!isJson(settingFileContents))
          return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

        const settings: AssignmentSettingsInfo = JSON.parse(settingFileContents.toString());

        if (settings.rubric && settings.rubric.name.toLowerCase() === rubricName.toLowerCase())
          found = true;
      });

      return sendResponseData(req, res, 200, found);
    } catch (e) {
      return sendResponse(req, res, 500, e.message);
    }
  });
};
app.post('/api/rubric/delete/check',
  check('rubricName').not().isEmpty().withMessage(NOT_PROVIDED_RUBRIC), deleteRubricsFn);

const deleteRubricConfirmation = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  if (!req.body.rubricName)
    return sendResponse(req, res, 400, NOT_PROVIDED_RUBRIC);

  if (!req.body.confirmation)
    return sendResponse(req, res, 400, FORBIDDEN_RESOURCE);

  const rubricName: string = req.body.rubricName.trim();

  if (existsSync(CONFIG_DIR + RUBRICS_FILE)) {
    return readFromFile(req, res, CONFIG_DIR + RUBRICS_FILE, (data) => {
      if (!isJson(data))
        return sendResponse(req, res, 400, INVALID_RUBRIC_JSON_FILE);

      const rubrics: IRubric[] = JSON.parse(data.toString());
      if (Array.isArray(rubrics)) {
        let indexFound: number = -1;

        for (let i = 0; i < rubrics.length; i++) {
          if (rubrics[i].name.toLowerCase() === rubricName.toLowerCase()) {
            indexFound = i;
            break;
          }
        }

        if (indexFound == -1)
          return sendResponse(req, res, 404, 'Could not find rubric');
        else
          rubrics.splice(indexFound, 1);

        return writeRubricFile(req, res, rubrics);
      }
      return sendResponse(req, res, 400, COULD_NOT_READ_RUBRIC_LIST);
    });
  }

  return sendResponseData(req, res, 200, []);
};
app.post('/api/rubric/delete',
  check('rubricName').not().isEmpty().withMessage(NOT_PROVIDED_RUBRIC), deleteRubricConfirmation);
/* DELETE READ RUBRICS */

/*READ RUBRIC CONTENTS*/
const getRubricContentsFn = (req, res) => {
  if (!checkClient(req, res))
    return res.status(401).send({message: FORBIDDEN_RESOURCE});
  if (!req.body.rubricName)
    return res.status(400).send({message: NOT_PROVIDED_RUBRIC});
  const rubricName: string = req.body.rubricName;
  if (existsSync(CONFIG_DIR + RUBRICS_FILE)) {
    return readFromFile(req, res, CONFIG_DIR + RUBRICS_FILE, (data) => {
      if (!isJson(data))
        return res.status(400).send({message: INVALID_RUBRIC_JSON_FILE});
      const rubrics: IRubric[] = JSON.parse(data.toString());
      if (Array.isArray(rubrics)) {
        let indexFound: number = -1;

        for (let i = 0; i < rubrics.length; i++) {
          if (rubrics[i].name.toLowerCase() === rubricName.toLowerCase()) {
            indexFound = i;
            break;
          }
        }

        if (indexFound == -1)
          return res.status(404).send({message: 'Could not find rubric'});
        else {
          return res.status(200).send(rubrics[indexFound]);
        }
      }

    });
  }
  return res.status(400).send({message: COULD_NOT_READ_RUBRIC_LIST});
};
app.post('/api/rubric/contents',
  check('rubricName').not().isEmpty().withMessage(NOT_PROVIDED_RUBRIC), getRubricContentsFn);


/* END RUBRIC CONTENTS*/

/* CHANGE ASSIGNEMNT RUBRIC */

const assignmentRubricUpdateFn = (req, res) => {
  if (!checkClient(req, res))
    return res.status(401).send({message: FORBIDDEN_RESOURCE});

  if (!req.body.assignmentName)
    return res.status(400).send({message: NOT_PROVIDED_ASSIGNMENT_LOCATION});

  const rubricName: string = (req.body.rubricName) ? req.body.rubricName : null;
  const assignmentName: string = req.body.assignmentName;

  if (existsSync(CONFIG_DIR + RUBRICS_FILE)) {
    return readFromFile(req, res, CONFIG_DIR + RUBRICS_FILE, (data) => {
      if (!isJson(data))
        return res.status(400).send({message: INVALID_RUBRIC_JSON_FILE});
      const rubrics: IRubric[] = JSON.parse(data.toString());
      let rubric: IRubric;
      if (Array.isArray(rubrics)) {
        if (rubricName) {
          let indexFound: number = -1;

          for (let i = 0; i < rubrics.length; i++) {
            if (rubrics[i].name.toLowerCase() === rubricName.toLowerCase()) {
              indexFound = i;
              break;
            }
          }

          if (indexFound == -1)
            return res.status(404).send({message: 'Could not find rubric'});

          rubric = rubrics[indexFound];
        } else {
          rubric = null;
        }

        return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
          if (!isJson(data))
            return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

          const config = JSON.parse(data.toString());
          try {
            const markFiles = glob.sync(config.defaultPath + sep + assignmentName + sep + "/**/" + MARK_FILE);
            markFiles.forEach(markFile => {
              unlinkSync(markFile);
            });
            return readFromFile(req, res, config.defaultPath + sep + assignmentName + sep + SETTING_FILE, (data) => {
              if (!isJson(data))
                return sendResponse(req, res, 400, "invalid assignment settings");

              const assignmentSettingsInfo: AssignmentSettingsInfo = JSON.parse(data);
              assignmentSettingsInfo.rubric = rubric;

              return writeToFile(req, res, config.defaultPath + sep + assignmentName + sep + SETTING_FILE,
                JSON.stringify(assignmentSettingsInfo), null, null, () => {

                  //return sendResponseData(req, res, 200, assignmentSettingsInfo.rubric);
                  return checkAccess(req, res, config.defaultPath + sep + assignmentName + sep + GRADES_FILE, () => {
                    return csvtojson().fromFile(config.defaultPath + sep + assignmentName + sep + GRADES_FILE)
                      .then((gradesJSON) => {
                        let changed = false;
                        let assignmentHeader;
                        for (let i = 0; i < gradesJSON.length; i++) {
                          if (i == 0) {
                            const keys = Object.keys(gradesJSON[i]);
                            if (keys.length > 0)
                              assignmentHeader = keys[0];
                          } else if (i > 1) {
                            gradesJSON[i].field5 = 0;
                            changed = true;
                          }
                        }

                        if (changed) {
                          return json2csv(gradesJSON, (err, csv) => {
                            if (err)
                              return sendResponse(req, res, 400, "Failed to convert json to csv!");

                            return writeToFile(req, res, config.defaultPath + sep + assignmentName + sep + GRADES_FILE, csv, "Successfully saved marks!", "Failed to save marks to " + GRADES_FILE + " file!", () => {
                              return sendResponseData(req, res, 200, assignmentSettingsInfo.rubric);
                            });
                          }, {emptyFieldValue: ''});
                        } else
                          return sendResponse(req, res, 400, "Failed to save mark");
                      })
                      .catch(reason => {
                        return sendResponse(req, res, 400, reason);
                      })
                  });
                });
            });
          } catch (e) {
            return sendResponse(req, res, 500, e.message);
          }
        });
      }
    });
  }
  return res.status(400).send({message: COULD_NOT_READ_RUBRIC_LIST});
};
app.post('/api/assignment/rubric/update', [
  check('assignmentName').not().isEmpty().withMessage(NOT_PROVIDED_ASSIGNMENT_LOCATION)
], assignmentRubricUpdateFn);
/* END CHANGE ASSIGNMENT RUBRIC*/

const getAssignments = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
    if (!isJson(data))
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

    const config = JSON.parse(data.toString());

    const folderModels = [];
    try {
      const folders: string[] = readdirSync(config.defaultPath);
      const folderCount = folders.length;
      if (folders.length) {
        folders.forEach(folder => {
          const files = glob.sync(config.defaultPath + '/' + folder + '/**');
          files.sort((a, b) => (a > b) ? 1 : -1);
          folderModels.push(hierarchyModel(files, config.defaultPath));
          if (folderModels.length == folderCount)
            return sendResponseData(req, res, 200, folderModels);
        })
      } else {
        return sendResponseData(req, res, 200, []);
      }
    } catch (e) {
      return sendResponse(req, res, 500, e.message);
    }
  });
};

app.get('/api/assignments', getAssignments);

const getPdfFile = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return sendResponseData(req, res, 400, {errors: errors.array()});

  return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
    if (!isJson(data))
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

    const config = JSON.parse(data.toString());
    const loc = req.body.location.replace(/\//g, sep);
    const actualPath = config.defaultPath + sep + loc;

    return checkAccess(req, res, actualPath, () => {
      const file = createReadStream(actualPath);
      file.pipe(res);
    });
  });
};

app.post('/api/pdf/file', [
  check('location').not().isEmpty().withMessage('File location not provided!')
], getPdfFile);

const savingMarks = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  if (req.body.location === null || req.body.location === undefined)
    return sendResponse(req, res, 400, 'File location not provided');

  const marks = Array.isArray(req.body.marks) ? req.body.marks : [];
  let totalMark = 0;
  if (!isNullOrUndefined(marks)) {
    const pages = Object.keys(marks);
    pages.forEach(page => {
      if (Array.isArray(marks[page])) {
        for (let i = 0; i < marks[page].length; i++)
          totalMark += (marks[page][i] && marks[page][i].totalMark) ? marks[page][i].totalMark : 0;
      }
    });
  }

  return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
    if (!isJson(data))
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

    const config = JSON.parse(data.toString());
    const loc = req.body.location.replace(/\//g, sep);
    const pathSplit = loc.split(sep);
    if (pathSplit.length !== 4)
      return sendResponse(req, res, 404, INVALID_PATH_PROVIDED);

    const regEx = /(.*)\((.+)\)/;
    if (!regEx.test(pathSplit[1]))
      return sendResponse(req, res, 404, INVALID_STUDENT_FOLDER);

    const studentFolder = dirname(dirname(config.defaultPath + sep + loc));

    return checkAccess(req, res, studentFolder, () => {
      return writeToFile(req, res, studentFolder + sep + MARK_FILE, new Uint8Array(Buffer.from(JSON.stringify(marks))), null, 'Failed to save student marks!', () => {
        const matches = regEx.exec(pathSplit[1]);

        const studentNumber = matches[2];
        const assignmentFolder = dirname(studentFolder);

        return checkAccess(req, res, assignmentFolder + sep + GRADES_FILE, () => {
          return csvtojson().fromFile(assignmentFolder + sep + GRADES_FILE)
            .then((gradesJSON) => {
              let changed = false;
              let assignmentHeader;
              for (let i = 0; i < gradesJSON.length; i++) {
                if (i == 0) {
                  const keys = Object.keys(gradesJSON[i]);
                  if (keys.length > 0)
                    assignmentHeader = keys[0];
                } else if (!isNullOrUndefined(assignmentHeader) && gradesJSON[i] && gradesJSON[i][assignmentHeader] === studentNumber) {
                  gradesJSON[i].field5 = totalMark;
                  changed = true;
                  json2csv(gradesJSON, (err, csv) => {
                    if (err)
                      return sendResponse(req, res, 400, "Failed to convert json to csv!");

                    return writeToFile(req, res, assignmentFolder + sep + GRADES_FILE, csv, "Successfully saved marks!", "Failed to save marks to " + GRADES_FILE + " file!", null);
                  }, {emptyFieldValue: ''});
                  break;
                }
              }

              if (changed) {
                // more logic to save new JSON to CSV
              } else
                return sendResponse(req, res, 400, "Failed to save mark");
            })
            .catch(reason => {
              return sendResponse(req, res, 400, reason);
            })
        });
      })
    })
  });
};

app.post("/api/assignment/marks/save", savingMarks);

const savingRubricMarks = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  if (isNullOrUndefined(req.body.location))
    return sendResponse(req, res, 400, 'File location not provided');

  if (isNullOrUndefined(req.body.rubricName))
    return sendResponse(req, res, 400, NOT_PROVIDED_RUBRIC);

  const marks = Array.isArray(req.body.marks) ? req.body.marks : [];
  const rubricName = req.body.rubricName.trim();

  return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
    if (!isJson(data))
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

    const config = JSON.parse(data.toString());
    const loc = req.body.location.replace(/\//g, sep);
    const pathSplit = loc.split(sep);
    if (pathSplit.length !== 4)
      return sendResponse(req, res, 404, INVALID_PATH_PROVIDED);

    const regEx = /(.*)\((.+)\)/;
    if (!regEx.test(pathSplit[1]))
      return sendResponse(req, res, 404, INVALID_STUDENT_FOLDER);

    const studentFolder = dirname(dirname(config.defaultPath + sep + loc));
    const assignmentFolder = dirname(studentFolder);

    return readFromFile(req, res, assignmentFolder + sep + SETTING_FILE, (data) => {
      if (!isJson(data))
        return sendResponse(req, res, 400, "Could not read assignment settings");

      const assignmentSettingsInfo: AssignmentSettingsInfo = JSON.parse(data.toString());

      if (isNullOrUndefined(assignmentSettingsInfo.rubric))
        return sendResponse(req, res, 400, "Assignment's settings does not contain a rubric!");
      else if (assignmentSettingsInfo.rubric.name !== rubricName)
        return sendResponse(req, res, 400, "Assignment's settings rubric does not match provided!");

      let totalMark = 0;
      marks.forEach((levelIndex: number, index: number) => {
        if (levelIndex !== null)
          totalMark += parseFloat("" + assignmentSettingsInfo.rubric.criterias[index].levels[levelIndex].score);
      });

      return checkAccess(req, res, studentFolder, () => {
        return writeToFile(req, res, studentFolder + sep + MARK_FILE, new Uint8Array(Buffer.from(JSON.stringify(marks))), null, 'Failed to save student marks!', () => {
          const matches = regEx.exec(pathSplit[1]);

          const studentNumber = matches[2];
          return checkAccess(req, res, assignmentFolder + sep + GRADES_FILE, () => {
            return csvtojson().fromFile(assignmentFolder + sep + GRADES_FILE)
              .then((gradesJSON) => {
                let changed = false;
                let assignmentHeader;
                for (let i = 0; i < gradesJSON.length; i++) {
                  if (i == 0) {
                    const keys = Object.keys(gradesJSON[i]);
                    if (keys.length > 0)
                      assignmentHeader = keys[0];
                  } else if (!isNullOrUndefined(assignmentHeader) && gradesJSON[i] && gradesJSON[i][assignmentHeader] === studentNumber) {
                    gradesJSON[i].field5 = totalMark;
                    changed = true;
                    json2csv(gradesJSON, (err, csv) => {
                      if (err)
                        return sendResponse(req, res, 400, "Failed to convert json to csv!");

                      return writeToFile(req, res, assignmentFolder + sep + GRADES_FILE, csv, "Successfully saved marks!", "Failed to save marks to " + GRADES_FILE + " file!", null);
                    }, {emptyFieldValue: ''});
                    break;
                  }
                }

                if (changed) {
                  // more logic to save new JSON to CSV
                } else
                  return sendResponse(req, res, 400, "Failed to save mark");
              })
              .catch(reason => {
                return sendResponse(req, res, 400, reason);
              })
          });
        })
      });
    });
  });
};

app.post("/api/assignment/rubric/marks/save", savingRubricMarks);

const getMarks = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  const errors = validationResult(req);
  if (!errors.isEmpty())
    return sendResponseData(req, res, 400, {errors: errors.array()});

  return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
    if (!isJson(data))
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

    const config = JSON.parse(data.toString());
    const loc = req.body.location.replace(/\//g, sep);
    const pathSplit = loc.split(sep);

    if (pathSplit.length !== 4)
      return sendResponse(req, res, 404, INVALID_PATH_PROVIDED);

    const regEx = /(.*)\((.+)\)/;
    if (!regEx.test(pathSplit[1]))
      return sendResponse(req, res, 404, INVALID_STUDENT_FOLDER);

    const studentFolder = dirname(dirname(config.defaultPath + sep + loc));

    return readFile(studentFolder + sep + MARK_FILE, (err, data) => {
      if (err)
        return sendResponseData(req, res, 200, []);

      if (!isJson(data))
        return sendResponseData(req, res, 200, []);
      else
        return sendResponseData(req, res, 200, JSON.parse(data.toString()));
    });
  });
};

app.post("/api/assignment/marks/fetch", [
  check('location').not().isEmpty().withMessage(NOT_PROVIDED_ASSIGNMENT_LOCATION)
], getMarks);

// Only For updating colour for now
const assignmentSettings = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  const errors = validationResult(req);
  if (!errors.isEmpty())
    return sendResponseData(req, res, 400, {errors: errors.array()});

  const assignmentSettings = (req.body.settings !== null && req.body.settings !== undefined) ? req.body.settings : {};
  if (JSON.stringify(assignmentSettings) === JSON.stringify({}))
    return res.status(200).send();

  // Check object compliance
  const keys = ["defaultColour", "isCreated", "rubric", " rubricId"];
  const assignmentSettingsKeys = Object.keys(assignmentSettings);
  let invalidKeyFound = false;
  assignmentSettingsKeys.forEach(key => {
    invalidKeyFound = (keys.indexOf(key) === -1);
  });

  if (invalidKeyFound)
    return sendResponse(req, res, 400, 'Invalid key found in settings');

  return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
    if (!isJson(data))
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

    const config = JSON.parse(data.toString());
    const loc = req.body.location.replace(/\//g, sep);
    const pathSplit = loc.split(sep);
    if (pathSplit.length !== 4)
      return sendResponse(req, res, 404, INVALID_PATH_PROVIDED);

    const regEx = /(.*)\((.+)\)/;
    if (!regEx.test(pathSplit[1]))
      return sendResponse(req, res, 404, INVALID_STUDENT_FOLDER);

    const assignmentFolder = dirname(dirname(dirname(config.defaultPath + sep + loc)));

    return checkAccess(req, res, assignmentFolder, () => {
      return readFromFile(req, res, assignmentFolder + sep + SETTING_FILE, (data) => {
        if (!isJson(data))
          return sendResponse(req, res, 400, 'Assignment settings file corrupt!');

        let settings: AssignmentSettingsInfo = JSON.parse(data);
        settings.defaultColour = (assignmentSettings.defaultColour) ? assignmentSettings.defaultColour : settings.defaultColour;
        const buffer = new Uint8Array(Buffer.from(JSON.stringify(settings)));

        return writeToFile(req, res, assignmentFolder + sep + SETTING_FILE, buffer, null, "Failed to save assignment settings!", () => {
          return sendResponseData(req, res, 200, assignmentSettings);
        })
      })
    });
  });
};

app.post('/api/assignment/settings', [
  check('location').not().isEmpty().withMessage(NOT_PROVIDED_ASSIGNMENT_LOCATION)
], assignmentSettings);

const getAssignmentSettings = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  const errors = validationResult(req);
  if (!errors.isEmpty())
    return sendResponseData(req, res, 400, {errors: errors.array()});

  return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
    if (!isJson(data))
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

    const config = JSON.parse(data.toString());
    const loc = req.body.location;
    if (isNullOrUndefined(loc) || loc == "")
      return sendResponse(req, res, 404, INVALID_PATH_PROVIDED);

    const assignmentFolder = config.defaultPath + sep + loc;

    return readFile(assignmentFolder + sep + SETTING_FILE, (err, data) => {
      if (err)
        return sendResponseData(req, res, 400, err.message);

      if (!isJson(data))
        return sendResponseData(req, res, 400, err.message);
      else
        return sendResponseData(req, res, 200, JSON.parse(data.toString()));
    });
  });
};

app.post("/api/assignment/settings/fetch", [
  check('location').not().isEmpty().withMessage(NOT_PROVIDED_ASSIGNMENT_LOCATION)
], getAssignmentSettings);

const getGrades = (req, res) => {
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  const errors = validationResult(req);
  if (!errors.isEmpty())
    return sendResponseData(req, res, 400, {errors: errors.array()});

  const keys = ["location"];
  const bodyKeys = Object.keys(req.body);

  if (validateRequest(keys, bodyKeys))
    return sendResponse(req, res, 400, 'Invalid parameter found in request');

  return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
    if (!isJson(data))
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

    const config = JSON.parse(data.toString());
    const loc = req.body.location.replace(/\//g, sep);

    const assignmentFolder = config.defaultPath + sep + loc;

    return checkAccess(req, res, assignmentFolder + sep + GRADES_FILE, () => {
      return csvtojson().fromFile(assignmentFolder + sep + GRADES_FILE)
        .then((gradesJSON) => {
          return sendResponseData(req, res, 200, gradesJSON);
        })
        .catch(reason => {
          return sendResponse(req, res, 400, reason);
        })
    });
  });
};

app.post("/api/assignment/grade", [
  check('location').not().isEmpty().withMessage(NOT_PROVIDED_ASSIGNMENT_LOCATION)
], getGrades);

const getAssignmentGlobalSettings = (req, res) => {
  if (!checkClient(req, res))
    return res.status(401).send({message: 'Forbidden access to resource!'});
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({errors: errors.array()});

  const keys = ["location"];
  const bodyKeys = Object.keys(req.body);

  if (validateRequest(keys, bodyKeys))
    return res.status(400).send({message: 'Invalid parameter found in request'});

  readFile(CONFIG_DIR + CONFIG_FILE, (err, data) => {
    if (err)
      return res.status(500).send({message: 'Failed to read configurations!'});

    if (!isJson(data))
      return res.status(404).send({message: 'Configure default location to extract files to on the settings page!'});

    const config = JSON.parse(data.toString());
    const loc = req.body.location.replace(/\//g, sep);

    const assignmentFolder = config.defaultPath + sep + loc;

    return access(assignmentFolder + sep + ".settings.json", constants.F_OK, (err) => {
      if (err)
        return res.status(200).send({message: 'Could not read settings file'});
      return (assignmentFolder + sep + ".settings.json");
    });
  });
};

app.post("/api/assignment/globalSettings/fetch", [
  check('location').not().isEmpty().withMessage(NOT_PROVIDED_ASSIGNMENT_LOCATION)
], getAssignmentGlobalSettings);

const validateRequest = (requiredKeys = [], recievedKeys = []): boolean => {
  let invalidKeyFound = false;
  for (let key of recievedKeys) {
    if (requiredKeys.indexOf(key) == -1) {
      invalidKeyFound = true;
      break;
    }
  }
  return invalidKeyFound;
};

const asyncForEach = async (array, callback) => {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
};

const finalizeAssignment = async (req, res) => {
  let failed: boolean = false;
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  const errors = validationResult(req);
  if (!errors.isEmpty())
    return sendResponseData(req, res, 400, {errors: errors.array()});

  const keys = ["location"];
  const bodyKeys = Object.keys(req.body);

  if (validateRequest(keys, bodyKeys))
    return sendResponse(req, res, 400, 'Invalid parameter found in request');

  try {
    const data = readFileSync(CONFIG_DIR + CONFIG_FILE);
    if (!isJson(data))
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

    const config = JSON.parse(data.toString());
    const loc = req.body.location.replace(/\//g, sep);
    const assignmentFolder = config.defaultPath + sep + loc;
    const assignmentName = pathinfo(assignmentFolder, 'PATHINFO_FILENAME');
    const gradesJSON = await csvtojson().fromFile(assignmentFolder + sep + GRADES_FILE);
    const files = glob.sync(assignmentFolder + sep + "/*");

    const start = async () => {
      await asyncForEach(files, async (file) => {
        if (statSync(file).isDirectory()) {
          const regEx = /(.*)\((.+)\)$/;
          if (!regEx.test(file)) {
            failed = true;
            return sendResponse(req, res, 500, INVALID_STUDENT_FOLDER + " " + basename(file));
          }

          const matches = regEx.exec(file);

          const submissionFiles = glob.sync(file + sep + SUBMISSION_FOLDER + "/*");
          await asyncForEach(submissionFiles, async (submission) => {
            try {
              accessSync(submission, constants.F_OK);
              const studentFolder = dirname(dirname(submission));

              let marks;
              let data;
              try {
                data = readFileSync(studentFolder + sep + MARK_FILE);
              } catch (e) {
                marks = [];
              }

              if (!isJson(data))
                marks = [];
              else
                marks = JSON.parse(data.toString());

              if (marks.length > 0) {
                const annotateFN = async (): Promise<{ pdfBytes: Uint8Array, totalMark: number }> => {
                  return await annotatePdfFile(res, submission, marks);
                };

                let fileName = pathinfo(submission, 'PATHINFO_FILENAME');
                await annotateFN().then(async (data) => {
                  fileName += "_MARK";
                  writeFileSync(studentFolder + sep + FEEDBACK_FOLDER + sep + fileName + ".pdf", data.pdfBytes);
                  accessSync(assignmentFolder + sep + GRADES_FILE, constants.F_OK);
                  let changed = false;
                  let assignmentHeader;
                  for (let i = 0; i < gradesJSON.length; i++) {
                    if (i == 0) {
                      const keys = Object.keys(gradesJSON[i]);
                      if (keys.length > 0) {
                        assignmentHeader = keys[0];
                      }
                    } else if (!isNullOrUndefined(assignmentHeader) && gradesJSON[i] && gradesJSON[i][assignmentHeader] === matches[2]) {
                      gradesJSON[i].field5 = data.totalMark;
                      changed = true;
                      await json2csvAsync(gradesJSON, {emptyFieldValue: ''})
                        .then(csv => {
                          writeFileSync(assignmentFolder + sep + GRADES_FILE, csv);
                        })
                        .catch(() => {
                          failed = true;
                          return sendResponse(req, res, 400, 'Failed to save marks to ' + GRADES_FILE + ' file for student ' + matches[2] + '!');
                        });

                      break;
                    }
                  }
                  if (!changed) {
                    failed = true;
                    return sendResponse(req, res, 400, "Failed to save mark");
                  }
                }, (error) => {
                  failed = true;
                  return sendResponse(req, res, 400, "Error annotating marks to PDF '" + fileName + "' [" + error.message + "]");
                });
              }
            } catch (e) {
              failed = true;
              return sendResponse(req, res, 400, e.message);
            }
          });
        }
      });
    };
    await start();
    if (!failed) {
      return zipDir(config.defaultPath, {filter: (path: string, stat) => (!(/\.marks\.json|.settings.json$/.test(path)) && ((path.endsWith(config.defaultPath + sep + assignmentName)) ? true : (path.startsWith(config.defaultPath + sep + assignmentName + sep))))}, (err, buffer) => {
        if (err)
          return sendResponse(req, res, 400, "Could not export assignment");
        return sendResponseData(req, res, 200, buffer);
      })
    }
  } catch (e) {
    return sendResponse(req, res, 500, e.message);
  }
};

app.post("/api/assignment/finalize", [
  check('location').not().isEmpty().withMessage(NOT_PROVIDED_ASSIGNMENT_LOCATION)
], finalizeAssignment);

// rubircFinalize
const finalizeAssignmentRubric = async (req, res) => {
  let failed: boolean = false;
  if (!checkClient(req, res))
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);

  const errors = validationResult(req);
  if (!errors.isEmpty())
    return sendResponseData(req, res, 400, {errors: errors.array()});

  const keys = ["location", "rubricName"];
  const bodyKeys = Object.keys(req.body);

  if (validateRequest(keys, bodyKeys))
    return sendResponse(req, res, 400, 'Invalid parameter found in request');

  try {
    const data = readFileSync(CONFIG_DIR + CONFIG_FILE);
    if (!isJson(data))
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

    const config = JSON.parse(data.toString());
    const loc = req.body.location.replace(/\//g, sep);
    const assignmentFolder = config.defaultPath + sep + loc;
    const assignmentName = pathinfo(assignmentFolder, 'PATHINFO_FILENAME');
    const gradesJSON = await csvtojson().fromFile(assignmentFolder + sep + GRADES_FILE);
    const files = glob.sync(assignmentFolder + sep + "/*");
    const assignmentSettingsBuffer = readFileSync(config.defaultPath + sep + assignmentName + sep + SETTING_FILE);
    if (!isJson(assignmentSettingsBuffer))
      return sendResponse(req, res, 400, "Invalid assignment settings file!");

    const assignmentSettingsInfo: AssignmentSettingsInfo = JSON.parse(assignmentSettingsBuffer.toString());

    const start = async () => {
      await asyncForEach(files, async (file) => {
        if (statSync(file).isDirectory()) {
          const regEx = /(.*)\((.+)\)$/;
          if (!regEx.test(file)) {
            failed = true;
            return sendResponse(req, res, 500, INVALID_STUDENT_FOLDER + " " + basename(file));
          }

          const matches = regEx.exec(file);

          const submissionFiles = glob.sync(file + sep + SUBMISSION_FOLDER + "/*");
          const rubricName = req.body.rubricName.trim();

          if (isNullOrUndefined(assignmentSettingsInfo.rubric))
            return sendResponse(req, res, 400, "Assignment's settings does not contain a rubric!");
          else if (assignmentSettingsInfo.rubric.name !== rubricName)
            return sendResponse(req, res, 400, "Assignment's settings rubric does not match provided!");

          const rubric = assignmentSettingsInfo.rubric;

          await asyncForEach(submissionFiles, async (submission) => {
            try {
              accessSync(submission, constants.F_OK);
              const studentFolder = dirname(dirname(submission));

              let marks;
              let data;
              try {
                data = readFileSync(studentFolder + sep + MARK_FILE);
              } catch (e) {
                marks = [];
              }

              if (!isJson(data))
                marks = [];
              else
                marks = JSON.parse(data.toString());

              if (marks.length > 0) {
                const annotateRubricFN = async (): Promise<{ pdfBytes: Uint8Array, totalMark: number }> => {
                  return await annotatePdfRubric(res, submission, marks, assignmentSettingsInfo.rubric);
                };

                await annotateRubricFN().then(async (data) => {
                  const fileName = pathinfo(submission, 'PATHINFO_FILENAME') + "_MARK";
                  writeFileSync(studentFolder + sep + FEEDBACK_FOLDER + sep + fileName + ".pdf", data.pdfBytes);
                  accessSync(assignmentFolder + sep + GRADES_FILE, constants.F_OK);
                  let changed = false;
                  let assignmentHeader;
                  for (let i = 0; i < gradesJSON.length; i++) {
                    if (i == 0) {
                      const keys = Object.keys(gradesJSON[i]);
                      if (keys.length > 0) {
                        assignmentHeader = keys[0];
                      }
                    } else if (!isNullOrUndefined(assignmentHeader) && gradesJSON[i] && gradesJSON[i][assignmentHeader] === matches[2]) {
                      gradesJSON[i].field5 = data.totalMark;
                      changed = true;
                      await json2csvAsync(gradesJSON, {emptyFieldValue: ''})
                        .then(csv => {
                          writeFileSync(assignmentFolder + sep + GRADES_FILE, csv);
                        })
                        .catch(() => {
                          failed = true;
                          return sendResponse(req, res, 400, 'Failed to save marks to ' + GRADES_FILE + ' file for student ' + matches[2] + '!');
                        });

                      break;
                    }
                  }
                  if (!changed) {
                    failed = true;
                    return sendResponse(req, res, 400, "Failed to save mark");
                  }
                }, (error) => {
                  failed = true;
                  return sendResponse(req, res, 400, "Error annotating marks to PDF [" + error.message + "]");
                });
              }
            } catch (e) {
              failed = true;
              return sendResponse(req, res, 400, e.message);
            }
          });
        }
      });
    };
    await start();
    if (!failed) {
      return zipDir(config.defaultPath, {filter: (path: string, stat) => (!(/\.marks\.json|.settings.json$/.test(path)) && ((path.endsWith(config.defaultPath + sep + assignmentName)) ? true : (path.startsWith(config.defaultPath + sep + assignmentName + sep))))}, (err, buffer) => {
        if (err)
          return sendResponse(req, res, 400, "Could not export assignment");
        return sendResponseData(req, res, 200, buffer);
      })
    }
  } catch (e) {
    return sendResponse(req, res, 500, e.message);
  }
};

app.post("/api/assignment/finalize/rubric", [
  check('location').not().isEmpty().withMessage(NOT_PROVIDED_ASSIGNMENT_LOCATION),
  check('rubricName').not().isEmpty().withMessage(NOT_PROVIDED_ASSIGNMENT_LOCATION)
], finalizeAssignmentRubric);


const annotatePdfRubric = async (res, filePath: string, marks = [], rubric: IRubric) => {
  const file = readFileSync(filePath);
  let pdfDoc = await PDFDocument.load(file);
  let totalMark = 0;
  let resultsPage = pdfDoc.addPage([841.89,595.28]);
  //841 pixels x 595.28 pixels
  let yPosition: number =resultsPage.getHeight() - 15;
  let xPosition: number = 25;
  const headerSize: number = 14;
  const criteriaHeaderSize: number = 10;
  const rubricTextSize: number = 8;
  const borderColor = {red: 0.21, green: 0.21, blue: 0.21};
  const rubricCriteriaBackGround = {red: 0.93, green: 0.93, blue: 0.93};
  const rubricCriteriaLevelBackground = {red: 1.0, green: 1.0, blue: 1.0};
  const rubricCriteriaLevelBackgroundSelected = {red: 0.93, green: 0.93, blue: 0.93};
  let criteriaColors =  {red: 1.0, green: 1.0, blue: 1.0};
  let maxScore = 0;
  rubric.criterias.forEach((value, index) => {
    let curHighest = -1;
    let critSelected = marks[index];
    value.levels.forEach((value1, index1, array) => {
      if (critSelected == index1)
      {
        totalMark = totalMark + parseFloat(value1.score.toString());
      }
      if (value1.score > curHighest)
        curHighest = value1.score;
    })
    maxScore = maxScore + parseFloat(curHighest.toString());
  })

  //841 pixels x 595.28 pixels
  resultsPage.drawText("Results", {x: xPosition, y: yPosition, size: headerSize});
  yPosition = adjustPointsForResults(yPosition, 15); //y = 580
  resultsPage.drawText("Total Mark: " + totalMark +" / " + maxScore, {x: xPosition, y: yPosition, size: headerSize});

  yPosition = adjustPointsForResults(yPosition, 20); //spacing between header and blocks.

  //Rubric - loop for criterias
  let criteriaCount = 0;
  rubric.criterias.forEach((value, criteriaIndex) => {
    criteriaCount++;
    yPosition = adjustPointsForResults(yPosition, 130);
    resultsPage.drawRectangle({x: xPosition, y: yPosition, width: 130, height: 130, borderWidth: 1, color: rgb(rubricCriteriaLevelBackground.red, rubricCriteriaLevelBackground.green, rubricCriteriaLevelBackground.blue), borderColor: rgb(borderColor.red, borderColor.green, borderColor.blue),});

    resultsPage.drawText(rubric.criterias[criteriaIndex].name, {x: (xPosition+3), y: (yPosition+110), size: rubricTextSize});
    let critSelected = marks[criteriaIndex];
    let splitDesc = (rubric.criterias[criteriaIndex].description.split(" "));
    let criteriaDescriptionX = xPosition + 1;
    let criteriaDescriptionY = yPosition + 90; // remember + is upwards, - is down, and function minues by default.
    //Rubric - loop for criteria-Descriptions -- start
    for (let index = 0; index <= splitDesc.length; index=index +3)
    {
      let curString = "";
      if (!isNullOrUndefinedOrEmpty(splitDesc[index])) {
        curString = curString + splitDesc[index]+" ";
      }
      if (!isNullOrUndefinedOrEmpty(splitDesc[index+1])) {
        curString = curString + splitDesc[index+1]+" ";
      }
      if (!isNullOrUndefinedOrEmpty(splitDesc[index+2])) {
        curString = curString + splitDesc[index+2]+" ";
      }
      resultsPage.drawText(curString, {x: (criteriaDescriptionX+3), y: (criteriaDescriptionY), size: rubricTextSize});
      criteriaDescriptionY = criteriaDescriptionY - 10;
    }
    let criteriaLevelX = xPosition;
    let criteriaLevelY = yPosition;

    rubric.criterias[criteriaIndex].levels.forEach((level, levelIndex) =>
    {
      //check selected here against marks.
      if ( critSelected == levelIndex) {
        criteriaColors   = rubricCriteriaLevelBackgroundSelected;
        critSelected = -1;
      } else {
        criteriaColors =  rubricCriteriaLevelBackground;
      }

      criteriaLevelX = criteriaLevelX + 130;
      resultsPage.drawRectangle({x: criteriaLevelX, y: criteriaLevelY, width: 130, height: 130, borderWidth: 1, color: rgb(criteriaColors.red, criteriaColors.green, criteriaColors.blue), borderColor: rgb(borderColor.red, borderColor.green, borderColor.blue),});
      resultsPage.drawText(level.label+" - Marks: "+ level.score, {x: (criteriaLevelX+3), y: (criteriaLevelY+120), size: rubricTextSize});

      let splitDesc = (level.description.replace('\n', "").split(" "));
      //let splitDesc = (level.description.replace('\n', "").split(""));
      let levelDescriptionX = criteriaLevelX + 1;
      let levelDescriptionY = criteriaLevelY + 110; // remember + is upwards, - is down, and function minues by default.
      //Rubric - loop for criteria-Descriptions -- start
      let lineCount = 0;
      for (let index = 0; index <= splitDesc.length; index=index+5) {
        let curString = "";
        if (!isNullOrUndefinedOrEmpty(splitDesc[index])) {
          curString = curString + splitDesc[index].replace('\n', "")+" ";
        }
        if (!isNullOrUndefinedOrEmpty(splitDesc[index+1])) {
          curString = curString + splitDesc[index+1].replace('\n', "")+" ";
        }
        if (!isNullOrUndefinedOrEmpty(splitDesc[index+2])) {
          curString = curString + splitDesc[index+2].replace('\n', "")+" ";
        }
        if (!isNullOrUndefinedOrEmpty(splitDesc[index+3])) {
          curString = curString + splitDesc[index+3].replace('\n', "")+" ";
        }
        if (curString.length < 42)
        {
        if (!isNullOrUndefinedOrEmpty(splitDesc[index+4])) {
          curString = curString + splitDesc[index+4].replace('\n', "")+" ";
        } } else {
          index--;
        }
        lineCount++;
        if (lineCount === 12 && !isNullOrUndefinedOrEmpty(curString)) {
          curString = curString + "..."
          index = splitDesc.length+1;
          lineCount = 0;
        }
        resultsPage.drawText(curString, {x: (levelDescriptionX+1), y: (levelDescriptionY), size: rubricTextSize-2});
        levelDescriptionY = levelDescriptionY - 10;
      }
      //Rubric - loop for level descripotion -- end
    })

  })
  //check for max pages. Maybe use dimnesnsions rather?
  if ((criteriaCount === 4) &&  (rubric.criterias.length > criteriaCount)){
    pdfDoc.save();
    resultsPage = pdfDoc.addPage([841.89,595.28]);
    yPosition =resultsPage.getHeight() - 15;
    xPosition= 25;
    criteriaCount = 0;
  }

  const newPdfBytes = await pdfDoc.save();
  return Promise.resolve({pdfBytes: newPdfBytes, totalMark: totalMark});
}
// rubricFinalize


const sendResponse = (req, res, statusCode: number, message: string) => {
  deleteUploadedFile(req);
  deleteMultipleFiles(req);
  return res.status(statusCode).send({message: message});
};

const sendResponseData = (req, res, statusCode: number, data: any) => {
  deleteUploadedFile(req);
  deleteMultipleFiles(req);
  return res.status(statusCode).send(data);
};

const getRgbScale = (rgbValue: number): number => {
  return +parseFloat(((rgbValue / 255) + "")).toFixed(2);
};

const annotatePdfFile = async (res, filePath: string, marks = []) => {
  let totalMark = 0;
  let generalMarks = 0;
  let sectionMarks: string[] = [];
  let commentPointers: string[] = [];
  let commentPointer: number = 1;
  let commentErrorFound: boolean = false;
  const file = readFileSync(filePath);
  const pdfFactory = new AnnotationFactory(file);
  let pdfDoc = await PDFDocument.load(file);
  let pdfPages: PDFPage[] = await pdfDoc.getPages();
  let pageCount: number = 1;
  pdfPages.forEach((pdfPage: PDFPage) => {
    if (Array.isArray(marks[pageCount - 1])) {
      marks[pageCount - 1].forEach(markObj => {
        const coords = markObj.coordinates;
        if (markObj.iconType === IconTypeEnum.NUMBER) {
          totalMark += (markObj.totalMark) ? markObj.totalMark : 0;
          try {
            pdfFactory.createTextAnnotation(pageCount - 1, [(coords.x * 72 / 96), pdfPage.getHeight() - (coords.y * 72 / 96) - 24, pdfPage.getWidth() - (coords.y * 72 / 96), pdfPage.getHeight() - (coords.y * 72 / 96)], markObj.comment, markObj.sectionLabel + " = " + markObj.totalMark);
          } catch (e) {
            commentErrorFound = true;
            commentPointers.push("*" + commentPointer + ": " + markObj.comment);
            commentPointer++;
          }
          sectionMarks.push(markObj.sectionLabel + ' = ' + markObj.totalMark);
        }
      });
    }
    pageCount++;
  });

  pageCount = 1;
  commentPointer = 1;
  pdfDoc = await PDFDocument.load(pdfFactory.write());
  pdfPages = await pdfDoc.getPages();
  pdfPages.forEach((pdfPage: PDFPage) => {
    if (Array.isArray(marks[pageCount - 1])) {
      marks[pageCount - 1].forEach(mark => {
        const colours = hexRgb(mark.colour);
        const coords = mark.coordinates;
        const options = {
          x: (coords.x * 72 / 96) + 4,
          y: pdfPage.getHeight() - (coords.y * 72 / 96),
          borderColor: rgb(getRgbScale(colours.red), getRgbScale(colours.green), getRgbScale(colours.blue)),
          color: rgb(getRgbScale(colours.red), getRgbScale(colours.green), getRgbScale(colours.blue)),
        };

        if (mark.iconType !== IconTypeEnum.NUMBER) {
          totalMark += (mark.totalMark) ? mark.totalMark : 0;
          generalMarks += (mark.totalMark) ? mark.totalMark : 0;
          if (mark.iconType === IconTypeEnum.FULL_MARK) {
            pdfPage.drawSvgPath(IconSvgEnum.FULL_MARK_SVG, options);
          } else if (mark.iconType === IconTypeEnum.HALF_MARK) {
            pdfPage.drawSvgPath(IconSvgEnum.FULL_MARK_SVG, options);
            pdfPage.drawSvgPath(IconSvgEnum.HALF_MARK_SVG, {
              x: (coords.x * 72 / 96) + 4,
              y: pdfPage.getHeight() - (coords.y * 72 / 96),
              borderWidth: 2,
              borderColor: rgb(getRgbScale(colours.red), getRgbScale(colours.green), getRgbScale(colours.blue)),
              color: rgb(getRgbScale(colours.red), getRgbScale(colours.green), getRgbScale(colours.blue)),
            });
          } else if (mark.iconType === IconTypeEnum.CROSS) {
            pdfPage.drawSvgPath(IconSvgEnum.CROSS_SVG, options);
          } else if (mark.iconType === IconTypeEnum.ACK_MARK) {
            pdfPage.drawSvgPath(IconSvgEnum.ACK_MARK_SVG, options);
          }
        } else {
          if(commentErrorFound) {
            const markOption = {
              x: (coords.x * 72 / 96) + 8,
              y: (pdfPage.getHeight() - (coords.y * 72 / 96)) - 20,
              size: 10,
              color: rgb(1, 1, 1)
            };

            const textOption = {
              x: (coords.x * 72 / 96) + 12,
              y: (pdfPage.getHeight() - (coords.y * 72 / 96)) - 5,
              size: 10
            };

            const circleOptions = {
              x: (coords.x * 72 / 96) + 16,
              y: (pdfPage.getHeight() - (coords.y * 72 / 96)) - 16,
              size: 10,
              color: rgb(getRgbScale(colours.red), getRgbScale(colours.green), getRgbScale(colours.blue))
            };

            pdfPage.drawCircle(circleOptions);
            pdfPage.drawText(mark.totalMark + '', markOption);
            pdfPage.drawText('*' + commentPointer, textOption);
            commentPointer++;
          }
        }
      });
    }
    pageCount++;
  });

  let resultsPage = pdfDoc.addPage(PageSizes.A4);
  let y: number = 800;
  const xPosition: number = 25;
  const headerSize: number = 14;
  const textSize: number = 12;
  const borderColor = {red: 0.71, green: 0.71, blue: 0.71};

  resultsPage.drawText('Results', {x: resultsPage.getWidth() / 2, y: y, size: headerSize});
  y = adjustPointsForResults(y, 15);
  y = adjustPointsForResults(y, 15);

  resultsPage.drawText('_________________________________________________________________________________',
    {
      x: xPosition,
      y: 775,
      color: rgb(borderColor.red, borderColor.green, borderColor.blue),
      size: textSize});
  y = adjustPointsForResults(y, 15);

  for (let i = 0; i < sectionMarks.length; i++) {
    y = adjustPointsForResults(y, 15);
    resultsPage.drawText(sectionMarks[i] + '', {x: xPosition, y: y, size: textSize});
    resultsPage.drawText('', {x: xPosition, y: y, size: textSize});

    if (y <= 5) {
      resultsPage = pdfDoc.addPage(PageSizes.A4);
      y = 800;
    }
  }
  y = adjustPointsForResults(y, 15);
  resultsPage.drawText('General Marks = ' + generalMarks, {x: xPosition, y: y, size: textSize});
  y = adjustPointsForResults(y, 15);
  resultsPage.drawText('_________________________________________________________________________________', {
    x: xPosition,
    y: y,
    color: rgb(borderColor.red, borderColor.green, borderColor.blue),
    size: textSize
  });
  y = adjustPointsForResults(y, 15);
  resultsPage.drawText('', {x: xPosition, y: y, size: textSize});
  y = adjustPointsForResults(y, 15);
  resultsPage.drawText('Total = ' + totalMark, {x: xPosition, y: y, size: textSize});

  if(commentErrorFound) {
    let feedbackPage = pdfDoc.addPage(PageSizes.A4);
    y = 800;

    feedbackPage.drawText('Feedback', {x: resultsPage.getWidth() / 2, y: y, size: headerSize});
    y = adjustPointsForResults(y, 15);
    y = adjustPointsForResults(y, 15);
    feedbackPage.drawText('_________________________________________________________________________________', {
      x: xPosition,
      y: 775,
      color: rgb(borderColor.red, borderColor.green, borderColor.blue),
      size: textSize
    });
    y = adjustPointsForResults(y, 15);

    for (let i = 0; i < commentPointers.length; i++) {
      const feedback = wrap(commentPointers[i], { width: 80 });
      const splitFeedback = feedback.split("\n");
      if(splitFeedback.length > 0) {
        for (let j = 0; j < splitFeedback.length; j++) {
          y = adjustPointsForResults(y, 15);
          feedbackPage.drawText(splitFeedback[j] + '', {x: xPosition, y: y, size: textSize});

          if (y <= 5) {
            feedbackPage = pdfDoc.addPage(PageSizes.A4);
            y = 800;
          }
        }
      } else {
        y = adjustPointsForResults(y, 15);
        feedbackPage.drawText(commentPointers[i] + '', {x: xPosition, y: y, size: textSize});

        if (y <= 5) {
          feedbackPage = pdfDoc.addPage(PageSizes.A4);
          y = 800;
        }
      }
    }
  }

  const newPdfBytes = await pdfDoc.save();
  return Promise.resolve({pdfBytes: newPdfBytes, totalMark: totalMark});
};

const adjustPointsForResults = (coordinate: number, change: number): number => {
  return coordinate - (change);
};

const createAssignment = (req, res) => {
  const acceptedParams = ["assignmentName", "noRubric", "rubric", "studentDetails"];
  const receivedParams = Object.keys(req.body);
  let isInvalidKey: boolean = false;
  let invalidParam: string;
  uploadFiles(req, res, function (err) {
    if (err) {
      return sendResponse(req, res, 400, 'Error uploading PDF files!');
    } else {
      for (let receivedParam of receivedParams) {
        if (acceptedParams.indexOf(receivedParam)) {
          isInvalidKey = true;
          invalidParam = receivedParam;
          break;
        }
      }

      if (isInvalidKey)
        return sendResponse(req, res, 400, `Invalid parameter ${invalidParam} found in request`);

      if (req.body.assignmentName.legnth < 5)
        return sendResponse(req, res, 400, `Assignment must be > 5 characters`);

      let assignmentName: string = req.body.assignmentName.trim();

      try {
        const data = readFileSync(CONFIG_DIR + CONFIG_FILE);
        if (!isJson(data))
          return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

        const config = JSON.parse(data.toString());
        const folders = glob.sync(config.defaultPath + '/*');

        let foundCount = 0;
        for (let i = 0; i < folders.length; i++) {
          if (isFolder(folders[i].toLowerCase())) {
            if (assignmentName.toLowerCase() === pathinfo(folders[i].toLowerCase(), 'PATHINFO_FILENAME'))
              foundCount++;
            else if ((assignmentName.toLowerCase() + " (" + (foundCount + 1) + ")") === pathinfo(folders[i].toLowerCase(), 'PATHINFO_FILENAME'))
              foundCount++;
          }
        }

        if (foundCount > 0)
          assignmentName = assignmentName + " (" + (foundCount + 1) + ")";

        const isRubric: boolean = (req.body.noRubric === 'true');
        let rubricName: string;
        let rubric: IRubric = null;
        let rubricIndex: number;
        let rubrics: IRubric[];

        if (!isRubric) {
          if (isNullOrUndefined(req.body.rubric))
            return sendResponse(req, res, 400, NOT_PROVIDED_RUBRIC);

          rubricName = req.body.rubric.trim();
          if (!isNullOrUndefined(rubricName)) {
            const rubricData = readFileSync(CONFIG_DIR + RUBRICS_FILE);
            try {
              if (!isJson(rubricData))
                return sendResponse(req, res, 400, INVALID_RUBRIC_JSON_FILE);

              rubrics = JSON.parse(rubricData.toString());

              if (Array.isArray(rubrics)) {
                let index: number = -1;
                for (let i = 0; i < rubrics.length; i++) {
                  if (rubrics[i].name === rubricName) {
                    index = i;
                    break;
                  }
                }

                if (index != -1) {
                  rubric = rubrics[index];
                  rubricIndex = index;
                }
              } else {
                return sendResponse(req, res, 400, COULD_NOT_READ_RUBRIC_LIST);
              }

            } catch (e) {
              return sendResponse(req, res, 500, e.message);
            }
          }
        }
        if (!isJson(req.body.studentDetails))
          return sendResponse(req, res, 400, `Student details not valid`);

        const studentDetails: any[] = JSON.parse(req.body.studentDetails);

        if (!Array.isArray(studentDetails))
          return sendResponse(req, res, 400, `Student details must be a list`);

        if (studentDetails.length !== req.files.length)
          return sendResponse(req, res, 400, `Student details is not equal to number of files sent!`);

        const settings: AssignmentSettingsInfo = {defaultColour: "#6F327A", rubric: rubric, isCreated: true};

        let count = 0;
        const headers = `"${assignmentName}","SCORE_GRADE_TYPE"\n`;
        const line = `""\n`;
        const subheaders = `"Display ID","ID","Last Name","First Name","Mark","Submission date","Late submission"\n`;
        let csvString = headers + line + subheaders;
        studentDetails.forEach((studentInfo: any) => {
          let file: any = req.files[count];
          const studentFolder = studentInfo.studentSurname.toUpperCase() + ", " + studentInfo.studentName.toUpperCase() + "(" + studentInfo.studentId.toUpperCase() + ")";
          const feedbackFolder = studentFolder + sep + FEEDBACK_FOLDER;
          const submissionFolder = studentFolder + sep + SUBMISSION_FOLDER;
          const csvData = `"${studentInfo.studentId.toUpperCase()}","${studentInfo.studentId.toUpperCase()}","${studentInfo.studentSurname.toUpperCase()}",${studentInfo.studentName.toUpperCase()},"","",""\n`;
          csvString += csvData;

          mkdirSync(config.defaultPath + sep + assignmentName + sep + feedbackFolder, {recursive: true});
          mkdirSync(config.defaultPath + sep + assignmentName + sep + submissionFolder, {recursive: true});
          copyFileSync(file.path, config.defaultPath + sep + assignmentName + sep + submissionFolder + sep + file.originalname);
          //unlinkSync(file.path);
          count++;
        });

        writeFileSync(config.defaultPath + sep + assignmentName + sep + GRADES_FILE, csvString);
        writeFileSync(config.defaultPath + sep + assignmentName + sep + SETTING_FILE, JSON.stringify(settings));
        const files = glob.sync(config.defaultPath + sep + assignmentName + sep + "/**");
        files.sort((a, b) => (a > b) ? 1 : -1);
        const folderModel = hierarchyModel(files, config.defaultPath);
        return sendResponseData(req, res, 200, folderModel);
      } catch (e) {
        return sendResponse(req, res, 400, e.message);
      }
    }
  });
};
app.post("/api/assignment/create", [
  check('assignmentName').not().isEmpty().withMessage('Assignment name must be provided!')
], createAssignment);

const updateAssignment = (req, res) => {
  const acceptedParams = ["assignmentName", "studentDetails", "isEdit"];
  const receivedParams = Object.keys(req.body);
  let isInvalidKey: boolean = false;
  let invalidParam: string;
  uploadFiles(req, res, async function (err) {
    if (err) {
      return sendResponse(req, res, 400, 'Error uploading PDF files!');
    } else {
      for (const receivedParam of receivedParams) {
        if (acceptedParams.indexOf(receivedParam)) {
          isInvalidKey = true;
          invalidParam = receivedParam;
          break;
        }
      }

      if (isInvalidKey)
        return sendResponse(req, res, 400, `Invalid parameter ${invalidParam} found in request`);

      if (req.body.assignmentName.legnth < 5)
        return sendResponse(req, res, 400, `Assignment must be > 5 characters`);

      const assignmentName: string = req.body.assignmentName.trim();
      const isEdit: boolean = (req.body.isEdit && req.body.isEdit === 'true');

      try {
        const data = readFileSync(CONFIG_DIR + CONFIG_FILE);
        if (!isJson(data))
          return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);

        const config = JSON.parse(data.toString());

        const assignmentSettingsBuffer = readFileSync(config.defaultPath + sep + assignmentName + sep + SETTING_FILE);
        if (!isJson(assignmentSettingsBuffer))
          return sendResponse(req, res, 400, "Invalid assignment settings file!");

        const assignmentSettingsInfo: AssignmentSettingsInfo = JSON.parse(assignmentSettingsBuffer.toString());
        if (!assignmentSettingsInfo.isCreated)
          return sendResponse(req, res, 400, "Operation not permitted on this type of assignment!");

        if (!isJson(req.body.studentDetails))
          return sendResponse(req, res, 400, `Student details not valid`);

        const studentDetails: any[] = JSON.parse(req.body.studentDetails);

        if (!Array.isArray(studentDetails))
          return sendResponse(req, res, 400, `Student details must be a list`);

        if (studentDetails.length !== req.files.length)
          return sendResponse(req, res, 400, `Student details is not equal to number of files sent!`);

        const grades = await csvtojson().fromFile(config.defaultPath + sep + assignmentName + sep + GRADES_FILE);

        let count = 0;
        const headers = `"${assignmentName}","SCORE_GRADE_TYPE"\n`;
        const line = `""\n`;
        const subheaders = `"Display ID","ID","Last Name","First Name","Mark","Submission date","Late submission"\n`;
        let csvString = headers + line + subheaders;
        studentDetails.forEach((studentInfo: any) => {
          let file: any = req.files[count];
          const studentFolder = studentInfo.studentSurname.toUpperCase() + ", " + studentInfo.studentName.toUpperCase() + "(" + studentInfo.studentId.toUpperCase() + ")";
          const feedbackFolder = studentFolder + sep + FEEDBACK_FOLDER;
          const submissionFolder = studentFolder + sep + SUBMISSION_FOLDER;
          let csvData = '';

          if (existsSync(config.defaultPath + sep + assignmentName + sep + studentFolder)) {
            if (studentInfo.remove) {
              deleteFolderRecursive(config.defaultPath + sep + assignmentName + sep + studentFolder);
            } else {
              const studentRecord = grades.find(grade => grade[Object.keys(grades[0])[0]] === studentInfo.studentId.toUpperCase());
              if (studentRecord) {
                csvData = `"${studentInfo.studentId.toUpperCase()}","${studentInfo.studentId.toUpperCase()}","${studentInfo.studentSurname.toUpperCase()}",${studentInfo.studentName.toUpperCase()},${studentRecord.field5},"",""\n`;
              } else {
                csvData = `"${studentInfo.studentId.toUpperCase()}","${studentInfo.studentId.toUpperCase()}","${studentInfo.studentSurname.toUpperCase()}",${studentInfo.studentName.toUpperCase()},"","",""\n`;
              }
            }
          } else {
            mkdirSync(config.defaultPath + sep + assignmentName + sep + feedbackFolder, {recursive: true});
            mkdirSync(config.defaultPath + sep + assignmentName + sep + submissionFolder, {recursive: true});
            copyFileSync(file.path, config.defaultPath + sep + assignmentName + sep + submissionFolder + sep + file.originalname);
            csvData = `"${studentInfo.studentId.toUpperCase()}","${studentInfo.studentId.toUpperCase()}","${studentInfo.studentSurname.toUpperCase()}",${studentInfo.studentName.toUpperCase()},"","",""\n`;
          }
          csvString += csvData;
          count++;
        });

        writeFileSync(config.defaultPath + sep + assignmentName + sep + GRADES_FILE, csvString);
        const files = glob.sync(config.defaultPath + sep + assignmentName + sep + "/**");
        files.sort((a, b) => (a > b) ? 1 : -1);
        const folderModel = hierarchyModel(files, config.defaultPath);

        return sendResponseData(req, res, 200, folderModel);
      } catch (e) {
        return sendResponse(req, res, 400, e.message);
      }
    }
  });
};
app.put("/api/assignment/update", [
  check('assignmentName').not().isEmpty().withMessage('Assignment name must be provided!')
], updateAssignment);

// All regular routes use the Universal engine
app.get('*', (req, res) => {
  res.render('index', {req});
});

// Start up the Node server
app.listen(PORT, () => {
  console.log(`Node Express server listening on http://localhost:${PORT}`);
});

const isJson = (str) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};

const extractZipFile = async (file, destination, newFolder, oldFolder) => {
  return await createReadStream(file)
    .pipe(unzipper.Parse())
    .pipe(etl.map(async entry => {
      if(entry.type === 'File') {
        const content = await entry.buffer();
        entry.path = entry.path.replace(oldFolder, newFolder);
        const directory = pathinfo(destination + entry.path.replace("/", sep), 1);
        if(!existsSync(directory))
          mkdirSync(directory, { recursive: true });
        await writeFileSync(destination + entry.path.replace("/", sep),  content);
      } else {
        entry.path = entry.path.replace(oldFolder, newFolder);
        const directory = destination + entry.path.replace("/", sep);
        if(!existsSync(directory))
          mkdirSync(directory, { recursive: true });
        entry.autodrain();
      }
    })).promise();
};

const hierarchyModel = (pathInfos, configFolder) => {
  const pattern = /\\/g;
  configFolder = configFolder.replace(pattern, '/');
  let model = pathInfos.reduce((hier, pathInfo) => {
    let stat = statSync(pathInfo);
    let path = pathInfo.replace(configFolder + '/', '');
    let pathObject: any = hier;
    let pathSplit = path.split("/");
    path.split("/").forEach((item) => {
      if (!pathObject[item]) {
        pathObject[item] = {};
      }
      pathObject = pathObject[item];
    });

    if (stat.isFile()) {
      pathObject.path = path;
      pathObject.basename = path.split("/").pop();
      if (pathSplit.indexOf(SUBMISSION_FOLDER) > -1)
        pathObject.isPdf = true;
    }
    return hier;
  }, {});

  return model;
};

const deleteFolderRecursive = (path) => {
  if (existsSync(path)) {
    readdirSync(path).forEach(function (file, index) {
      const curPath = path + "/" + file;
      if (isFolder(curPath)) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        unlinkSync(curPath);
      }
    });
    rmdirSync(path);
  }
};

function isFolder(curPath: string){
return lstatSync(curPath).isDirectory();
};
