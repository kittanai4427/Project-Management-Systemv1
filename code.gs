// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
var SHEET_ID = "1x-AOA_vjqkijJNVJ__L8O8az4cULH2vKbClE8vARdqk"; // ⚠️ ตรวจสอบ ID ให้ถูกต้อง

// ==========================================
// 🚀 MAIN WEB APP (DoGet)
// ==========================================
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Project Management System')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==========================================
// 📡 API: GET DATA (ระบบ Cache V7)
// ==========================================
function getSystemData() {
  var cache = CacheService.getScriptCache();
  try {
    // ✅ ใช้ V7
    var cachedJSON = cache.get("SYSTEM_DATA_V7"); 
    if (cachedJSON != null) {
      return JSON.parse(cachedJSON);
    }
  } catch (e) { console.log("Cache Error: " + e.message); }

  var data = fetchFromSheet();

  if (!data.error) {
    try {
      var jsonStr = JSON.stringify(data);
      if (jsonStr.length < 95000) { 
        // ✅ เก็บเป็น V7
        cache.put("SYSTEM_DATA_V7", jsonStr, 600); 
      }
    } catch(e) { console.log("Cannot cache data: " + e.message); }
  }
  return data;
}

function fetchFromSheet() {
  var systemData = {
    currentUser: { name: "Guest", email: "", role: "User" },
    allUsers: [], projects: [], tasks: [], updates: [], error: null
  };

  try {
    if (!SHEET_ID) throw new Error("ไม่พบ Sheet ID");
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var userEmail = Session.getActiveUser().getEmail();
    systemData.currentUser.email = userEmail;

    // 1. Users
    // 1. Users
    var usersSheet = ss.getSheetByName("DB_Users");
    if (usersSheet) {
      var uData = usersSheet.getDataRange().getValues();
      uData.shift(); // ตัดหัวตาราง (Header) ออก
      
      // ค้นหา Current User (ส่วนเดิม)
      var foundUser = uData.find(r => r[1] === userEmail);
      if (foundUser) systemData.currentUser = { name: foundUser[0], email: foundUser[1], role: foundUser[2], photoUrl: foundUser[4] };
      else systemData.currentUser.name = userEmail;

      // ✅ ส่วนที่แก้ไข: ดึงข้อมูลสมาชิกทั้งหมดแบบเต็มรูปแบบ (Full Format)
      systemData.allUsers = uData.map(r => ({
        name: r[0],          // Column A: ชื่อ
        email: r[1],         // Column B: อีเมล
        role: r[2],          // Column C: ตำแหน่ง (Admin/Manager/User)
        team: r[3],          // Column D: ทีม
        photoUrl: r[4] || "",// Column E: ลิงก์รูปภาพ
        status: r[5] || "Active" // Column F: สถานะ (Active/Inactive)
      }));
    }

    // 2. Projects
    var projectSheet = ss.getSheetByName("DB_Projects");
    if (projectSheet && projectSheet.getLastRow() > 1) {
      var pData = projectSheet.getRange(2, 1, projectSheet.getLastRow() - 1, 16).getValues();
      systemData.projects = pData;
    }

    // 3. Tasks
    var taskSheet = ss.getSheetByName("DB_Tasks");
    if (taskSheet && taskSheet.getLastRow() > 1) {
      var tData = taskSheet.getDataRange().getValues();
      tData.shift();
      systemData.tasks = tData.map(row => {
        if (row[7] && Object.prototype.toString.call(row[7]) === '[object Date]') {
           row[7] = Utilities.formatDate(row[7], "GMT+7", "yyyy-MM-dd");
        }
        return row;
      });
    }

    // 4. Updates
    var updateSheet = ss.getSheetByName("DB_Updates");
    if (updateSheet && updateSheet.getLastRow() > 1) {
      var upData = updateSheet.getDataRange().getValues();
      upData.shift();
      systemData.updates = upData;
    }

  } catch (e) {
    Logger.log("SERVER ERROR: " + e.message);
    systemData.error = e.message;
  }

  return systemData;
}

// 🧹 ล้าง Cache (V7)
function clearCache() {
  try { 
    CacheService.getScriptCache().remove("SYSTEM_DATA_V7"); 
  } catch(e){}
}

// ==========================================
// 👤 USER MANAGEMENT
// ==========================================
function checkLoginUser(input) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Users");
  var data = sheet.getDataRange().getValues();
  
  var searchStr = input.toString().trim().toLowerCase();

  for (var i = 1; i < data.length; i++) {
    var dbName = data[i][0].toString().trim().toLowerCase();
    var dbEmail = data[i][1].toString().trim().toLowerCase();

    if ((dbName === searchStr) || (dbEmail === searchStr && dbEmail !== "")) {
      return {
        status: true,
        user: {
          name: data[i][0],
          email: data[i][1],
          role: data[i][2],
          team: data[i][3]
        }
      };
    }
  }
  return { status: false };
}

function saveUserDB(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("DB_Users");
  const values = ws.getDataRange().getValues();
  
  let rowIndex = -1;
  if (data.originalEmail) {
    rowIndex = values.findIndex(row => row[1] == data.originalEmail); 
  }
  
  if (rowIndex === -1) {
     const dupIndex = values.findIndex(row => row[1] == data.email);
     if (dupIndex !== -1 && !data.originalEmail) {
       return { success: false, message: "อีเมลนี้มีอยู่ในระบบแล้ว" };
     }
     if (rowIndex === -1) rowIndex = values.length; 
  }

  const rowNum = rowIndex + 1;
  ws.getRange(rowNum, 1).setValue(data.name);
  ws.getRange(rowNum, 2).setValue(data.email);
  ws.getRange(rowNum, 3).setValue(data.role);
  ws.getRange(rowNum, 4).setValue(data.team);
  if(data.photoUrl) ws.getRange(rowNum, 5).setValue(data.photoUrl);
  ws.getRange(rowNum, 6).setValue(data.status || 'Active');

  clearCache(); // ✅ ล้าง Cache
  return { success: true };
}

function deleteUserDB(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("DB_Users");
  const values = ws.getDataRange().getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] == email) {
      ws.getRange(i + 1, 6).setValue('Inactive'); 
      clearCache(); // ✅ ล้าง Cache
      return { success: true };
    }
  }
  return { success: false, message: "ไม่พบผู้ใช้งาน" };
}

function updateUserProfile(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Users");
  var values = sheet.getDataRange().getValues();
  
  for (var i = 1; i < values.length; i++) {
    if (values[i][1].toString().toLowerCase() === data.email.toLowerCase()) {
      sheet.getRange(i + 1, 1).setValue(data.name);
      sheet.getRange(i + 1, 5).setValue(data.photoUrl);
      clearCache(); // ✅ ล้าง Cache ทันที
      return true;
    }
  }
  return false;
}

function getCurrentUserEmail() {
  return Session.getActiveUser().getEmail();
}

// ==========================================
// 🛠️ PROJECT FUNCTIONS
// ==========================================
function createProject(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Projects");
  
  var newId = "P-" + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  var ids = sheet.getRange(2, 1, sheet.getLastRow(), 1).getValues().flat();
  while (ids.includes(newId)) {
    newId = "P-" + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  }

  var rowData = [
    newId, data.customerName, data.product, data.aeOwner, data.budget || "-", data.period || "-",
    data.targetContent || "0", data.targetVDO || "0", data.sheetLink || "", "Active",  "Pending", 
    data.targetAdmin || "0", data.targetAds || "0", data.targetWeb || "0", data.remark || "", data.targetGraphic || "0"
  ];

  sheet.appendRow(rowData);
  clearCache(); 
  return rowData;
}

function postProjectUpdate(projectId, message, userName, fileData) {
  var fileInfo = uploadFileToDrive(fileData);
  var newId = "U-" + new Date().getTime();
  var dateStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
  
  writeToSheet("DB_Updates", [
    newId, projectId, dateStr, userName, message, fileInfo.name, fileInfo.url
  ]);
  
  clearCache(); 
  return { id: newId, date: dateStr, fileName: fileInfo.name, fileUrl: fileInfo.url };
}

function updateProjectStatus(projectId, newStatus) {
  return updateCell("DB_Projects", projectId, 10, null, newStatus, null);
}

function updateProjectRemark(projectId, newRemark) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Projects");
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == projectId) {
      sheet.getRange(i + 1, 15).setValue(newRemark);
      clearCache(); // ✅ V7
      return "Success";
    }
  }
  return "Project Not Found";
}

// ==========================================
// 📋 TASK & WORKFLOW FUNCTIONS (CORE)
// ==========================================

// ฟังก์ชันหลัก: บันทึก Content/Task (แก้ไขแล้ว)
function saveContentTaskDB(data, fileData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("DB_Tasks");
  let taskId = data.taskId;
  let fileUrl = "";
  let fileName = "";

  if (fileData) {
    try {
      var fileInfo = uploadFileToDrive(fileData);
      fileUrl = fileInfo.url;
      fileName = fileInfo.name;
    } catch(e) { }
  }

  let workflowJson = "";
  try {
     var steps = getWorkflowTemplate(data.taskType || 'Content');
     if (steps && steps.length > 0 && data.roleAssignments) {
         steps.forEach(step => {
             if (data.roleAssignments[step.role]) step.assignee = data.roleAssignments[step.role];
         });
     }
     workflowJson = JSON.stringify(steps);
  } catch(e) { workflowJson = "[]"; }

  if (taskId) {
    // --- Edit Mode ---
    var dataRange = ws.getDataRange().getValues();
    for (var i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] == taskId) {
        ws.getRange(i + 1, 3).setValue(data.taskType);
        ws.getRange(i + 1, 4).setValue(data.taskName);
        ws.getRange(i + 1, 5).setValue(data.assignee); 
        
        // ✅ ปรับตำแหน่งการเขียนข้อมูล (ข้าม Col L ที่ว่างอยู่)
        ws.getRange(i + 1, 13).setValue(workflowJson); // Col M
        ws.getRange(i + 1, 14).setValue(data.pillar);  // Col N
        ws.getRange(i + 1, 15).setValue(data.mediaType); // Col O
        ws.getRange(i + 1, 16).setValue(data.remark);    // Col P
        
        if (fileUrl) {
          ws.getRange(i + 1, 10).setValue(fileUrl);
          ws.getRange(i + 1, 11).setValue(fileName);
        }
        break;
      }
    }
  } else {
    // --- New Mode ---
    taskId = "T-" + Math.floor(Math.random() * 1000000).toString(16);
    const newRow = [
      taskId, data.projectId, data.taskType, data.taskName, data.assignee, 
      data.status, 0, data.dueDate, "", 
      fileUrl,     
      fileName,    
      "",          // ✅ เว้นว่าง Col L (Index 11)
      workflowJson,// [Index 12]
      data.pillar, // [Index 13]
      data.mediaType, // [Index 14]
      data.remark  // [Index 15]
    ];
    ws.appendRow(newRow);
  }
  
  clearCache(); // ✅ ล้าง V7
  
  // ✅ Return Array (Index ตรงกับ Sheet)
  return [
      taskId, data.projectId, data.taskType, data.taskName, data.assignee, // [4]
      data.status, 0, data.dueDate, "", 
      fileUrl, fileName, 
      "",           // [11]
      workflowJson, // [12]
      data.pillar,  // [13]
      data.mediaType, // [14]
      data.remark   // [15]
  ];
}

// function createTask(form, fileData) {
//   var fileInfo = uploadFileToDrive(fileData);
//   var res = writeToSheet("DB_Tasks", [
//     "T-" + Utilities.getUuid().slice(0,6),
//     form.projectId, form.taskType, form.taskName, form.assignee, 
//     "Pending", 0, form.dueDate, form.briefLink, fileInfo.url, fileInfo.name
//   ]);
//   clearCache();
//   return res;
// }

// ในไฟล์ code.gs
function createTask(form, fileData) {
  var fileInfo = uploadFileToDrive(fileData);
  
  // สร้าง Workflow JSON (ใส่ลงช่อง 11)
  var workflowJson = "[]";
  try {
     var steps = getWorkflowTemplate(form.taskType); 
     workflowJson = JSON.stringify(steps);
  } catch(e) {}

  var res = writeToSheet("DB_Tasks", [
    "T-" + Utilities.getUuid().slice(0,6), // [0] Task_ID
    form.projectId,                        // [1] Ref_Project_ID
    form.taskType,                         // [2] Task_Type
    form.taskName,                         // [3] Task_Name
    form.assignee,                         // [4] Assignee
    "Pending",                             // [5] Status
    0,                                     // [6] Progress_Pct
    form.dueDate,                          // [7] Due_Date
    form.briefLink,                        // [8] Brief_Link
    fileInfo.url,                          // [9] Brief_File_URL
    fileInfo.name,                         // [10] Brief_File_Name
    workflowJson,                          // [11] Workflow_JSON (ตรงกับ Col L)
    form.pillar,                           // [12] Content_Pillar (ตรงกับ Col M)
    form.mediaType,                        // [13] Media_Type (ตรงกับ Col N)
    ""                                     // [14] Remark (ตรงกับ Col O)
  ]);
  
  clearCache();
  return res;
}
function updateTaskProgress(taskId, newStatus, newProgress) {
  return updateCell("DB_Tasks", taskId, 6, 7, newStatus, newProgress);
}

function updateTaskRevision(taskId, newDueDate, newLink, fileData, stepIndex) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Tasks");
  var data = sheet.getDataRange().getValues();
  
  var fileInfo = fileData ? uploadFileToDrive(fileData) : { name: "", url: "" };

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == taskId) {
      
      sheet.getRange(i + 1, 6).setValue("Revise"); 
      if (newDueDate) sheet.getRange(i + 1, 8).setValue(newDueDate);
      if (newLink) sheet.getRange(i + 1, 9).setValue(newLink);
      if (fileInfo.url) {
        sheet.getRange(i + 1, 10).setValue(fileInfo.url);
        sheet.getRange(i + 1, 11).setValue(fileInfo.name);
      }

      var jsonStr = data[i][12]; // Col M
      var steps = [];
      try { steps = jsonStr ? JSON.parse(jsonStr) : []; } catch(e) {}
      
      var newAssignee = null;
      var updatedWorkflow = null;

      if (steps.length > 0 && stepIndex != null && stepIndex != -1 && steps[stepIndex]) {
          steps[stepIndex].status = 'doing';
          var targetUser = steps[stepIndex].assignee;
          if (targetUser && targetUser !== 'Unassigned') {
              sheet.getRange(i + 1, 5).setValue(targetUser);
              newAssignee = targetUser;
          }
          updatedWorkflow = JSON.stringify(steps);
          sheet.getRange(i + 1, 13).setValue(updatedWorkflow); // Col M
      }

      clearCache(); // ✅ ล้าง V7
      
      return { 
          status: "Success", 
          fileUrl: fileInfo.url, 
          fileName: fileInfo.name,
          updatedWorkflow: updatedWorkflow,
          newAssignee: newAssignee
      };
    }
  }
  return { status: "Task Not Found" };
}

function updateTaskWorkflowStatus(taskId, stepIndex) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Tasks");
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == taskId) {
      var taskType = data[i][2];
      var jsonStr = data[i][12]; // Col M
      
      var steps = [];
      try { steps = jsonStr ? JSON.parse(jsonStr) : []; } catch(e) { steps = []; }
      if (steps.length === 0) steps = getWorkflowTemplate(taskType);
      
      if (steps[stepIndex]) {
         var current = steps[stepIndex].status || 'pending';
         steps[stepIndex].status = (current === 'pending') ? 'doing' : (current === 'doing' ? 'done' : 'pending');
      }

      var allDone = steps.every(s => s.status === 'done');
      var anyDoing = steps.some(s => s.status === 'doing' || s.status === 'done');
      var newMainStatus = allDone ? 'Done' : (anyDoing ? 'In Progress' : 'Pending');

      var newJson = JSON.stringify(steps);
      sheet.getRange(i + 1, 13).setValue(newJson); // Col M
      sheet.getRange(i + 1, 6).setValue(newMainStatus);
      
      clearCache(); // ✅ ล้าง V7
      
      return { taskType: taskType, workflowJson: newJson, newMainStatus: newMainStatus };
    }
  }
  return null;
}

function updateTaskWorkflowAssignee(taskId, stepIndex, newName, newDate, newDetails) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Tasks");
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == taskId) {
      var taskType = data[i][2];
      var jsonStr = data[i][12]; // Col M
      
      var steps = [];
      try { steps = jsonStr ? JSON.parse(jsonStr) : []; } catch(e) { steps = []; }
      if (steps.length === 0) steps = getWorkflowTemplate(taskType);
      
      if (steps[stepIndex]) {
         steps[stepIndex].assignee = newName;
         steps[stepIndex].dueDate = newDate || "";
         steps[stepIndex].details = newDetails || "";

         var newJson = JSON.stringify(steps);
         sheet.getRange(i + 1, 13).setValue(newJson); // Col M
         
         clearCache(); // ✅ ล้าง V7
         return { taskType: taskType, workflowJson: newJson };
      }
    }
  }
  return null;
}

function getWorkflowTemplate(type) {
  var templates = {
    'VDO': [
      {name:'Script/Storyboard', role:'Content', status:'pending', assignee:'Unassigned'},
      {name:'Shooting', role:'VDO', status:'pending', assignee:'Unassigned'},
      {name:'Editing', role:'Editor', status:'pending', assignee:'Unassigned'},
      {name:'Final QC', role:'Manager', status:'pending', assignee:'Unassigned'}
    ],
    'Graphic': [
      {name:'Brief Concept', role:'Content', status:'pending', assignee:'Unassigned'},
      {name:'Draft Design', role:'Graphic', status:'pending', assignee:'Unassigned'},
      {name:'Finalize', role:'Graphic', status:'pending', assignee:'Unassigned'}
    ],
    'Content': [
      {name:'Topic/Keyword', role:'Content', status:'pending', assignee:'Unassigned'},
      {name:'Drafting', role:'Content', status:'pending', assignee:'Unassigned'},
      {name:'Proofread', role:'Editor', status:'pending', assignee:'Unassigned'}
    ],
    'Web': [
      {name:'Structure/UX', role:'Web', status:'pending', assignee:'Unassigned'},
      {name:'UI Design', role:'Graphic', status:'pending', assignee:'Unassigned'},
      {name:'Coding', role:'Web', status:'pending', assignee:'Unassigned'}
    ],
    'Default': [
      {name:'To Do', role:'Any', status:'pending', assignee:'Unassigned'},
      {name:'Doing', role:'Any', status:'pending', assignee:'Unassigned'},
      {name:'Done', role:'Any', status:'pending', assignee:'Unassigned'}
    ]
  };
  return templates[type] || templates['Default'];
}

// ==========================================
// 🛠️ HELPER FUNCTIONS
// ==========================================
function writeToSheet(sheetName, rowData) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("ไม่พบแท็บ " + sheetName);
  sheet.appendRow(rowData);
  return rowData;
}

function updateCell(sheetName, id, colIndex1, colIndex2, val1, val2) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      sheet.getRange(i + 1, colIndex1).setValue(val1);
      if(colIndex2) sheet.getRange(i + 1, colIndex2).setValue(val2);
      clearCache(); // ✅ ล้าง V7
      return "Success";
    }
  }
}

function uploadFileToDrive(fileData) {
  if (!fileData) return { name: "", url: "" };
  try {
    var folderName = "Project_Uploads";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, fileData.name);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    var fileUrl = file.getMimeType().startsWith("image/") 
                  ? "https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId() 
                  : file.getUrl();

    return { name: fileData.name, url: fileUrl };
  } catch (e) { return { name: "Error Uploading", url: "" }; }
}


// --- เพิ่มต่อท้ายในไฟล์ code.gs ---

// ⚡️ ฟังก์ชันดึงข้อมูล Task รายตัว (ไม่ผ่าน Cache)
function getTaskById(taskId) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Tasks");
  var data = sheet.getDataRange().getValues();
  
  // ค้นหาแถวที่ตรงกับ Task ID
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == taskId) {
       var row = data[i];
       
       // แปลงวันที่ให้เป็น Format ที่ถูกต้อง
       if (row[7] && Object.prototype.toString.call(row[7]) === '[object Date]') {
           row[7] = Utilities.formatDate(row[7], "GMT+7", "yyyy-MM-dd");
       }
       
       // ส่งกลับข้อมูลแถวนั้นทั้งแถว
       return row;
    }
  }
  return null; // ไม่พบข้อมูล
}

function forceAuth() { DriveApp.getRootFolder(); }
