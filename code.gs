// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
var SHEET_ID = "1kUWKcbpIW-XLL6b8FMfspJd-24GIeMZAP0kwe28Pdt8"; // ⚠️ ตรวจสอบ ID

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
// 📡 API: GET DATA (ดึงข้อมูลทั้งหมด + Cache)
// ==========================================
function getSystemData() {
  var cache = CacheService.getScriptCache();
  try {
    // 🔴 แก้จาก V5 เป็น V6
    var cachedJSON = cache.get("SYSTEM_DATA_V6"); 
    if (cachedJSON != null) {
      return JSON.parse(cachedJSON);
    }
  } catch (e) { console.log("Cache Error: " + e.message); }

  var data = fetchFromSheet();

  if (!data.error) {
    try {
      var jsonStr = JSON.stringify(data);
      if (jsonStr.length < 95000) { 
        // 🔴 แก้จาก V5 เป็น V6
        cache.put("SYSTEM_DATA_V6", jsonStr, 600); 
      }
    } catch(e) { console.log("Cannot cache data: " + e.message); }
  }
  return data;
}

function checkLoginUser(input) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Users");
  var data = sheet.getDataRange().getValues();
  
  var searchStr = input.toString().trim().toLowerCase(); // แปลงเป็นตัวพิมพ์เล็ก

  for (var i = 1; i < data.length; i++) {
    var dbName = data[i][0].toString().trim().toLowerCase();  // ชื่อใน DB
    var dbEmail = data[i][1].toString().trim().toLowerCase(); // อีเมลใน DB

    // ✅ เช็คว่า input ตรงกับ "ชื่อ" หรือ "อีเมล" ไหม
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


// --- User Management Functions ---

// บันทึกข้อมูลผู้ใช้งาน (เพิ่มใหม่ หรือ แก้ไข)
// --- User Management Functions (Updated) ---

function saveUserDB(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("DB_Users");
  const values = ws.getDataRange().getValues();
  
  let rowIndex = -1;
  // หาแถวจากอีเมลเดิม (กรณีแก้ไข)
  if (data.originalEmail) {
    rowIndex = values.findIndex(row => row[1] == data.originalEmail); 
  }
  
  // กรณีเพิ่มใหม่ เช็คอีเมลซ้ำ
  if (rowIndex === -1) {
     const dupIndex = values.findIndex(row => row[1] == data.email);
     if (dupIndex !== -1 && !data.originalEmail) {
       return { success: false, message: "อีเมลนี้มีอยู่ในระบบแล้ว" };
     }
     if (rowIndex === -1) rowIndex = values.length; 
  }

  const rowNum = rowIndex + 1;
  
  // บันทึกข้อมูล (Name, Email, Role, Team, Photo, Status)
  ws.getRange(rowNum, 1).setValue(data.name);
  ws.getRange(rowNum, 2).setValue(data.email);
  ws.getRange(rowNum, 3).setValue(data.role);
  ws.getRange(rowNum, 4).setValue(data.team);
  
  // ถ้ามีคอลัมน์รูป (Col 5) และสถานะ (Col 6)
  // แนะนำให้ไปเพิ่มหัวข้อคอลัมน์ F ใน Sheet ว่า "Status"
  if(data.photoUrl) ws.getRange(rowNum, 5).setValue(data.photoUrl);
  ws.getRange(rowNum, 6).setValue(data.status || 'Active'); // Default Active

  return { success: true };
}

// เปลี่ยนเป็นฟังก์ชัน "ระงับสิทธิ์" แทนการลบถาวร (Soft Delete)
function deleteUserDB(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("DB_Users");
  const values = ws.getDataRange().getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] == email) {
      // แทนที่จะลบแถว ให้เปลี่ยนสถานะเป็น Inactive
      ws.getRange(i + 1, 6).setValue('Inactive'); 
      return { success: true };
    }
  }
  return { success: false, message: "ไม่พบผู้ใช้งาน" };
}

// เพิ่มฟังก์ชันนี้ลงใน code.gs
function getCurrentUserEmail() {
  // ดึงอีเมลของคนที่กำลังเปิดเว็บอยู่
  return Session.getActiveUser().getEmail();
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
      uData.shift(); 
      
      var foundUser = uData.find(r => r[1] === userEmail);
      if (foundUser) systemData.currentUser = { name: foundUser[0], email: foundUser[1], role: foundUser[2] };
      else systemData.currentUser.name = userEmail;

      // ✅ แก้ตรงนี้: ดึงข้อมูลมาให้ครบทุกช่อง (Name, Email, Role, Team, Photo, Status)
      systemData.allUsers = uData.map(r => ({ 
        name: r[0], 
        email: r[1], 
        role: r[2], 
        team: r[3], 
        photoUrl: r[4], 
        status: r[5] 
      }));
    
    }

    // 2. Projects (ดึงมาครบทุกคอลัมน์)
    var projectSheet = ss.getSheetByName("DB_Projects");
    if (projectSheet && projectSheet.getLastRow() > 1) {
      // ดึงข้อมูลทั้งหมดรวมคอลัมน์ใหม่ (A -> P)
      // A:ID, B:Name, C:Product, D:AE, E:Budget, F:Period, 
      // G:Content, H:VDO, I:Link, J:Status, K:Billing, 
      // L:Admin, M:Ads, N:Web, O:Remark, P:Graphic
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

    // 4. Updates (Chat) - สำคัญสำหรับระบบแจ้งเตือน
    var updateSheet = ss.getSheetByName("DB_Updates");
    if (updateSheet && updateSheet.getLastRow() > 1) {
      // ดึงข้อมูลแชททั้งหมด
      var upData = updateSheet.getDataRange().getValues();
      upData.shift(); // ตัด Header ออก
      systemData.updates = upData;
    }

  } catch (e) {
    Logger.log("SERVER ERROR: " + e.message);
    systemData.error = e.message;
  }

  return systemData;
}

// 🧹 ล้าง Cache
function clearCache() {
  try { CacheService.getScriptCache().remove("SYSTEM_DATA_V5"); } catch(e){}
}

// ==========================================
// 🛠️ FUNCTION: CREATE PROJECT (อัปเดตใหม่)
// ==========================================
function createProject(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Projects");
  
  var newId = "P-" + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  var ids = sheet.getRange(2, 1, sheet.getLastRow(), 1).getValues().flat();
  while (ids.includes(newId)) {
    newId = "P-" + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  }

  // ✅ เรียงข้อมูลให้ตรงกับคอลัมน์ใหม่ (A -> P)
  var rowData = [
    newId,
    data.customerName,
    data.product,
    data.aeOwner,
    data.budget || "-",
    data.period || "-",
    data.targetContent || "0",
    data.targetVDO || "0",
    data.sheetLink || "",
    "Active",  
    "Pending", 
    data.targetAdmin || "0",      // Col L
    data.targetAds || "0",        // Col M
    data.targetWeb || "0",        // Col N
    data.remark || "",            // Col O
    data.targetGraphic || "0"     // Col P
  ];

  sheet.appendRow(rowData);
  clearCache(); // ล้าง Cache ทันทีที่มีการเพิ่มข้อมูล
  return rowData;
}

// ==========================================
// 💬 FUNCTION: POST UPDATE (Chat & Notify)
// ==========================================
function postProjectUpdate(projectId, message, userName, fileData) {
  var fileInfo = uploadFileToDrive(fileData);
  var newId = "U-" + new Date().getTime(); // Unique ID ตามเวลาจริง (ดีกว่า UUID สำหรับเรียงลำดับ)
  var dateStr = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");
  
  // บันทึกลง DB_Updates
  // A:ID, B:ProjectID, C:Date, D:User, E:Message, F:FileName, G:FileURL
  writeToSheet("DB_Updates", [
    newId, projectId, dateStr, userName, message, fileInfo.name, fileInfo.url
  ]);
  
  clearCache(); // 🧹 สำคัญมาก เพื่อให้คนอื่นเห็นข้อความใหม่ทันที
  
  return { id: newId, date: dateStr, fileName: fileInfo.name, fileUrl: fileInfo.url };
}

// ==========================================
// 🛠️ OTHER FUNCTIONS (Task, Status, File)
// ==========================================

function createTask(form, fileData) {
  var fileInfo = uploadFileToDrive(fileData);
  var res = writeToSheet("DB_Tasks", [
    "T-" + Utilities.getUuid().slice(0,6),
    form.projectId, form.taskType, form.taskName, form.assignee, 
    "Pending", 0, form.dueDate, form.briefLink, fileInfo.url, fileInfo.name
  ]);
  clearCache();
  return res;
}

function updateTaskProgress(taskId, newStatus, newProgress) {
  return updateCell("DB_Tasks", taskId, 6, 7, newStatus, newProgress);
}

function updateProjectStatus(projectId, newStatus) {
  // Col J = Index 10 (ถ้า A=1)
  return updateCell("DB_Projects", projectId, 10, null, newStatus, null);
}

// แก้ไข: รับ parameter stepIndex เพิ่ม
function updateTaskRevision(taskId, newDueDate, newLink, fileData, stepIndex) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Tasks");
  var data = sheet.getDataRange().getValues();
  
  var fileInfo = fileData ? uploadFileToDrive(fileData) : { name: "", url: "" };

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == taskId) {
      
      // 1. อัปเดตข้อมูลทั่วไป
      sheet.getRange(i + 1, 6).setValue("Revise"); // Status หลัก = Revise
      if (newDueDate) sheet.getRange(i + 1, 8).setValue(newDueDate);
      if (newLink) sheet.getRange(i + 1, 9).setValue(newLink);
      if (fileInfo.url) {
        sheet.getRange(i + 1, 10).setValue(fileInfo.url);
        sheet.getRange(i + 1, 11).setValue(fileInfo.name);
      }

      // 2. ✅ เพิ่มส่วนนี้: จัดการ Workflow และเปลี่ยน Assignee ตามขั้นตอนที่เลือก
      var jsonStr = data[i][12]; // Col M (Workflow JSON)
      var steps = [];
      try { steps = jsonStr ? JSON.parse(jsonStr) : []; } catch(e) {}
      
      var newAssignee = null;
      var updatedWorkflow = null;

      // ตรวจสอบว่ามีขั้นตอนที่เลือกส่งมาหรือไม่
      if (steps.length > 0 && stepIndex != null && stepIndex != -1 && steps[stepIndex]) {
          // เปลี่ยนสถานะขั้นตอนนี้กลับเป็น 'doing' เพื่อให้ขึ้นสีฟ้า/เหลือง
          steps[stepIndex].status = 'doing';
          
          // ดึงชื่อคนรับผิดชอบในขั้นตอนนี้
          var targetUser = steps[stepIndex].assignee;
          
          // ถ้ามีคนรับผิดชอบ ให้เปลี่ยน Assignee หลักของงาน (Col E / Index 4) เป็นคนนั้น
          if (targetUser && targetUser !== 'Unassigned') {
              sheet.getRange(i + 1, 5).setValue(targetUser);
              newAssignee = targetUser;
          }

          // บันทึก Workflow JSON ใหม่ลงฐานข้อมูล (Col M / Index 12)
          updatedWorkflow = JSON.stringify(steps);
          sheet.getRange(i + 1, 13).setValue(updatedWorkflow);
      }

      clearCache();
      
      // ส่งค่ากลับไปหน้าเว็บ
      return { 
          status: "Success", 
          fileUrl: fileInfo.url, 
          fileName: fileInfo.name,
          updatedWorkflow: updatedWorkflow, // ส่ง JSON ใหม่กลับไป
          newAssignee: newAssignee // ส่งชื่อคนรับผิดชอบใหม่กลับไป
      };
    }
  }
  return { status: "Task Not Found" };
}

// Helper: Write to Sheet
function writeToSheet(sheetName, rowData) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("ไม่พบแท็บ " + sheetName);
  sheet.appendRow(rowData);
  return rowData;
}

// Helper: Update Cell
function updateCell(sheetName, id, colIndex1, colIndex2, val1, val2) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      sheet.getRange(i + 1, colIndex1).setValue(val1);
      if(colIndex2) sheet.getRange(i + 1, colIndex2).setValue(val2);
      clearCache();
      return "Success";
    }
  }
}

// Helper: Upload File
function uploadFileToDrive(fileData) {
  if (!fileData) return { name: "", url: "" };
  try {
    var folderName = "Project_Uploads";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, fileData.name);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Check Image or File
    var fileUrl = file.getMimeType().startsWith("image/") 
                  ? "https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId() 
                  : file.getUrl();

    return { name: fileData.name, url: fileUrl };
  } catch (e) { return { name: "Error Uploading", url: "" }; }
}


// ==========================================
// 📝 FUNCTION: UPDATE REMARK
// ==========================================
function updateProjectRemark(projectId, newRemark) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Projects");
  var data = sheet.getDataRange().getValues();
  
  // ค้นหาแถวที่ตรงกับ Project ID
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == projectId) {
      // Column O คือคอลัมน์ที่ 15
      sheet.getRange(i + 1, 15).setValue(newRemark);
      
      // ล้าง Cache เพื่อให้หน้าเว็บเห็นข้อมูลใหม่ทันที
      try { CacheService.getScriptCache().remove("SYSTEM_DATA_V5"); } catch(e){}
      
      return "Success";
    }
  }
  return "Project Not Found";
}





// ==========================================
// 🔄 WORKFLOW FUNCTIONS (ฉบับ Auto-Init)
// ==========================================

// Helper: สร้าง Template เริ่มต้นถ้าไม่มีข้อมูล
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
// 🔄 WORKFLOW FUNCTIONS (Update Status)
// ==========================================

// ในไฟล์ code.gs

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
      
      // 1. อัปเดตสถานะของขั้นตอนย่อยที่กด
      if (steps[stepIndex]) {
         var current = steps[stepIndex].status || 'pending';
         // วนลูป: pending -> doing -> done -> pending
         steps[stepIndex].status = (current === 'pending') ? 'doing' : (current === 'doing' ? 'done' : 'pending');
      }

      // =======================================================
      // ✅ ส่วนที่เพิ่ม: ตรวจสอบและเปลี่ยนสถานะงานหลักอัตโนมัติ
      // =======================================================
      var allDone = steps.every(function(s) { return s.status === 'done'; });
      var anyDoing = steps.some(function(s) { return s.status === 'doing' || s.status === 'done'; });

      var newMainStatus = data[i][5]; // ค่าเดิม

      if (allDone) {
        newMainStatus = 'Done';        // ถ้าเสร็จครบทุกข้อ -> Done
      } else if (anyDoing) {
        newMainStatus = 'In Progress'; // ถ้าเริ่มทำบางข้อ -> In Progress
      } else {
        newMainStatus = 'Pending';     // ถ้ายังไม่ทำอะไรเลย -> Pending
      }

      // 2. บันทึก Workflow JSON
      var newJson = JSON.stringify(steps);
      sheet.getRange(i + 1, 13).setValue(newJson); 

      // 3. ✅ บันทึกสถานะงานหลักลง Database (Col F = Index 6)
      sheet.getRange(i + 1, 6).setValue(newMainStatus);
      // =======================================================
      
     try { CacheService.getScriptCache().remove("SYSTEM_DATA_V6"); } catch(e){}
      
      // ส่งค่ากลับไปบอกหน้าเว็บ
      return { 
        taskType: taskType, 
        workflowJson: newJson, 
        newMainStatus: newMainStatus // ✅ ส่งค่าสถานะใหม่กลับไปด้วย
      };
    }
  }
  return null;
}

// 2. อัปเดตคนรับผิดชอบ (ถ้าไม่มีข้อมูล จะสร้างให้ก่อน)
// แก้ไขบรรทัดรับค่า function ให้รับ newDate, newDetails เพิ่ม
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
      
      if (steps.length === 0) {
        steps = getWorkflowTemplate(taskType);
      }
      
      if (steps[stepIndex]) {
         steps[stepIndex].assignee = newName;
         
         // ✅ บันทึกค่าใหม่ลงไปใน Object
         steps[stepIndex].dueDate = newDate || "";
         steps[stepIndex].details = newDetails || "";

         var newJson = JSON.stringify(steps);
         sheet.getRange(i + 1, 13).setValue(newJson);
         
         try { CacheService.getScriptCache().remove("SYSTEM_DATA_V5"); } catch(e){}
         
         return { taskType: taskType, workflowJson: newJson };
      }
    }
  }
  return null;
}

function forceAuth() { DriveApp.getRootFolder(); }

// ในไฟล์ code.gs ค้นหาฟังก์ชัน saveContentTaskDB

function saveContentTaskDB(data, fileData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("DB_Tasks");
  
  let taskId = data.taskId;
  let fileUrl = "";
  let fileName = "";

  // 1. อัปโหลดไฟล์ (ถ้ามี)
  if (fileData) {
    try {
      var fileInfo = uploadFileToDrive(fileData); 
      fileUrl = fileInfo.url;
      fileName = fileInfo.name;
    } catch(e) { }
  }

  // ============================================================
  // ✅ ส่วนที่ปรับปรุง: สร้าง Workflow ตามตำแหน่งที่ระบุมา
  // ============================================================
  let workflowJson = "";
  try {
     // ดึง Template ตามประเภทงาน (Content, Graphic, VDO)
     var steps = getWorkflowTemplate(data.taskType || 'Content'); 
     
     // ถ้ามีข้อมูลการมอบหมายตำแหน่งส่งมา (roleAssignments)
     if (steps && steps.length > 0 && data.roleAssignments) {
         steps.forEach(step => {
             // ถ้ามีชื่อคนรับผิดชอบใน Role นี้ ให้ใส่ชื่อคนนั้น
             if (data.roleAssignments[step.role]) {
                 step.assignee = data.roleAssignments[step.role];
                 // (Optional) ถ้าอยากให้เริ่มงานเลยเฉพาะคนแรก
                 // if (step === steps[0]) step.status = 'doing'; 
             }
         });
     }
     workflowJson = JSON.stringify(steps);
  } catch(e) { workflowJson = "[]"; }
  // ============================================================

  // 3. บันทึกลง Sheet
  if (taskId) {
    // --- กรณีแก้ไข (Edit) ---
    var dataRange = ws.getDataRange().getValues();
    for (var i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] == taskId) {
        ws.getRange(i + 1, 3).setValue(data.taskType); // Col C: Task Type (เผื่อเปลี่ยน)
        ws.getRange(i + 1, 4).setValue(data.taskName);
        ws.getRange(i + 1, 5).setValue(data.mainAssignee); // ผู้รับผิดชอบหลัก
        
        // อัปเดต Workflow ใหม่ (ทับของเดิมเพื่อให้คนรับผิดชอบเปลี่ยนตาม)
        ws.getRange(i + 1, 13).setValue(workflowJson); 
        
        ws.getRange(i + 1, 14).setValue(data.pillar);   
        ws.getRange(i + 1, 15).setValue(data.mediaType);
        ws.getRange(i + 1, 16).setValue(data.remark);   
        
        if (fileUrl) {
          ws.getRange(i + 1, 10).setValue(fileUrl);
          ws.getRange(i + 1, 11).setValue(fileName);
        }
        break;
      }
    }
  } else {
    // --- กรณีสร้างใหม่ (New) ---
    taskId = "T-" + Math.floor(Math.random() * 1000000).toString(16);
    const newRow = [
      taskId,
      data.projectId,
      data.taskType,   // ✅ ใช้ Type ที่ส่งมา (Content/Graphic/VDO)
      data.taskName,
      data.mainAssignee, // ✅ ผู้รับผิดชอบหลัก
      data.status,
      0,
      data.dueDate,
      "",
      fileUrl,
      fileName,
      workflowJson,    // ✅ Workflow ที่ระบุคนแล้ว
      "",
      data.pillar,
      data.mediaType,
      data.remark
    ];
    ws.appendRow(newRow);
  }
  
  return [
      taskId, data.projectId, data.taskType, data.taskName, 
      data.mainAssignee, data.status, 0, data.dueDate, "", 
      fileUrl, fileName, workflowJson, 
      "", data.pillar, data.mediaType, data.remark
  ];
}

function updateUserProfile(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID); // หรือ SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("DB_Users");
  var values = sheet.getDataRange().getValues();
  
  // ค้นหาแถวของผู้ใช้จาก Email (Column B -> Index 1)
  for (var i = 1; i < values.length; i++) {
    if (values[i][1].toString().toLowerCase() === data.email.toLowerCase()) {
      // อัปเดตชื่อ (Column A -> แถว i+1, คอลัมน์ 1)
      sheet.getRange(i + 1, 1).setValue(data.name);
      
      // อัปเดตรูปภาพ (Column E -> แถว i+1, คอลัมน์ 5)
      // *ต้องมั่นใจว่าสร้างคอลัมน์ E ไว้แล้ว*
      sheet.getRange(i + 1, 5).setValue(data.photoUrl);
      
      return true; // สำเร็จ
    }
  }
  return false; // ไม่พบผู้ใช้
}
