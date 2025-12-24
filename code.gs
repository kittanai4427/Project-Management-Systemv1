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

    var usersSheet = ss.getSheetByName("DB_Users");
    if (usersSheet) {
      var uData = usersSheet.getDataRange().getValues();
      uData.shift(); // ตัดหัวตาราง

      // 1.1 หา Current User (โค้ดเดิม)
      var foundUser = uData.find(r => r[1] === userEmail);
      if (foundUser) systemData.currentUser = { name: foundUser[0], email: foundUser[1], role: foundUser[2], photoUrl: foundUser[4] };
      else systemData.currentUser.name = userEmail;

      // 1.2 เตรียมข้อมูลดิบ (เผื่อใช้)
      systemData.allUsers = uData.map(r => ({
        name: r[0], email: r[1], role: r[2], team: r[3], photoUrl: r[4], status: r[5]
      }));

      // ✅ 1.3 สร้าง HTML ตารางเตรียมไว้เลย (เพิ่มส่วนนี้)
      var html = "";
      if (uData.length === 0) {
        html = '<tr><td colspan="6" class="text-center py-4">ไม่พบรายชื่อพนักงาน</td></tr>';
      } else {
        uData.forEach(function(row, index) {
          var name = row[0], email = row[1], role = row[2], team = row[3], photo = row[4], status = row[5] || 'Active';
          var avatar = photo || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=random');
          var statusBadge = (status === 'Inactive') ? '<span class="badge bg-secondary">Inactive</span>' : '<span class="badge bg-success">Active</span>';
          
          var userObj = { name: name, email: email, role: role, team: team, photoUrl: photo, status: status };
          var userJson = encodeURIComponent(JSON.stringify(userObj));

          html += '<tr>';
          html += '  <td class="ps-4 text-muted">' + (index + 1) + '</td>';
          html += '  <td><div class="d-flex align-items-center"><img src="' + avatar + '" class="rounded-circle me-3 border" width="40" height="40" style="object-fit: cover;"><div><div class="fw-bold text-dark">' + name + '</div><div class="small text-muted">' + email + '</div></div></div></td>';
          html += '  <td><span class="badge bg-light text-dark border">' + role + '</span></td>';
          html += '  <td><small class="text-secondary">' + team + '</small></td>';
          html += '  <td>' + statusBadge + '</td>';
          html += '  <td class="text-end pe-4">';
          html += '    <button class="btn btn-sm btn-outline-primary me-1" onclick="openUserModal(\'' + userJson + '\')"><i class="fas fa-edit"></i></button>';
          html += '    <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(\'' + email + '\')"><i class="fas fa-trash"></i></button>';
          html += '  </td>';
          html += '</tr>';
        });
      }
      // ส่ง HTML กลับไปพร้อมข้อมูลระบบเลย
      systemData.userTableHtml = html;
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

  // ✅ แก้ไขส่วนนี้: เปลี่ยนวิธีค้นหาให้รอบคอบขึ้น (Trim + LowerCase)
  if (data.originalEmail) {
    const searchEmail = String(data.originalEmail).trim().toLowerCase();
    
    rowIndex = values.findIndex(row => 
      String(row[1]).trim().toLowerCase() === searchEmail
    );
  }
  
  // ... (ส่วนตรวจสอบ Duplicates และการบันทึกด้านล่าง เหมือนเดิม) ...
  
  if (rowIndex === -1) {
     // กรณีหาไม่เจอจริงๆ หรือเป็นการเพิ่มใหม่ ให้เช็คซ้ำว่าอีเมลใหม่ซ้ำไหม
     const newEmail = String(data.email).trim().toLowerCase();
     const dupIndex = values.findIndex(row => String(row[1]).trim().toLowerCase() === newEmail);
     
     if (dupIndex !== -1 && !data.originalEmail) {
       return { success: false, message: "อีเมลนี้มีอยู่ในระบบแล้ว" };
     }
     if (rowIndex === -1) rowIndex = values.length; // ต่อท้ายแถวใหม่
  }

  const rowNum = rowIndex + 1;
  ws.getRange(rowNum, 1).setValue(data.name);
  ws.getRange(rowNum, 2).setValue(data.email);
  ws.getRange(rowNum, 3).setValue(data.role);
  ws.getRange(rowNum, 4).setValue(data.team);
  if(data.photoUrl) ws.getRange(rowNum, 5).setValue(data.photoUrl);
  ws.getRange(rowNum, 6).setValue(data.status || 'Active');

  clearCache(); 
  return { success: true };
}

function deleteUserDB(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("DB_Users");
  const values = ws.getDataRange().getValues();
  
  // แปลงอีเมลที่รับมา ให้เป็นตัวเล็กและตัดช่องว่างซ้ายขวา
  const targetEmail = String(email).trim().toLowerCase();
  
  for (let i = 1; i < values.length; i++) {
    // แปลงอีเมลในฐานข้อมูล ให้เป็นตัวเล็กและตัดช่องว่างเหมือนกัน
    const dbEmail = String(values[i][1]).trim().toLowerCase();

    // เปรียบเทียบ
    if (dbEmail === targetEmail) {
      ws.getRange(i + 1, 6).setValue('Inactive'); // เปลี่ยนสถานะเป็น Inactive
      
      clearCache(); // ✅ สั่งล้าง Cache (สำคัญมากสำหรับการโหลดแบบ Instant)
      return { success: true };
    }
  }
  
  return { success: false, message: "ไม่พบอีเมล: " + email + " ในระบบ" };
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


// --- วางต่อท้ายไฟล์ code.gs ---

function getUserTableHtml() {
  // 1. ดึงข้อมูลจาก Sheet โดยตรง
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("DB_Users");
  var data = sheet.getDataRange().getValues();
  data.shift(); // ตัดหัวตารางออก

  var html = "";

  // 2. สร้าง HTML ของตารางเตรียมไว้เลย
  if (data.length === 0) {
    return '<tr><td colspan="6" class="text-center py-4">ไม่พบรายชื่อพนักงาน</td></tr>';
  }

  data.forEach(function(row, index) {
    var name = row[0];
    var email = row[1];
    var role = row[2];
    var team = row[3];
    var photo = row[4];
    var status = row[5] || 'Active';

    var avatar = photo || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=random');
    var statusBadge = (status === 'Inactive') ? 
        '<span class="badge bg-secondary">Inactive</span>' : 
        '<span class="badge bg-success">Active</span>';
    
    // สร้าง Object ข้อมูลสำหรับปุ่มแก้ไข (ต้อง Encode เพื่อส่งผ่าน HTML)
    var userObj = { name: name, email: email, role: role, team: team, photoUrl: photo, status: status };
    var userJson = encodeURIComponent(JSON.stringify(userObj));

    // ต่อ String HTML
    html += '<tr>';
    html += '  <td class="ps-4 text-muted">' + (index + 1) + '</td>';
    html += '  <td><div class="d-flex align-items-center"><img src="' + avatar + '" class="rounded-circle me-3 border" width="40" height="40" style="object-fit: cover;"><div><div class="fw-bold text-dark">' + name + '</div><div class="small text-muted">' + email + '</div></div></div></td>';
    html += '  <td><span class="badge bg-light text-dark border">' + role + '</span></td>';
    html += '  <td><small class="text-secondary">' + team + '</small></td>';
    html += '  <td>' + statusBadge + '</td>';
    html += '  <td class="text-end pe-4">';
    html += '    <button class="btn btn-sm btn-outline-primary me-1" onclick="openUserModal(\'' + userJson + '\')"><i class="fas fa-edit"></i></button>';
    html += '    <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(\'' + email + '\')"><i class="fas fa-trash"></i></button>';
    html += '  </td>';
    html += '</tr>';
  });

  return html; // ส่ง HTML กลับไปแปะหน้าเว็บได้เลย
}

// ==========================================
// 🛠️ PROJECT FUNCTIONS
// ==========================================
/**
 * ฟังก์ชันสร้างโปรเจกต์ใหม่
 * รับข้อมูล object จากหน้าบ้าน และบันทึกลง Sheet
 */
/**
 * ฟังก์ชันสร้างโปรเจกต์ใหม่ (แก้ไขให้ตรงกับ CSV DB_Projects)
 */
function createProject(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // ⚠️ ตรวจสอบว่าชื่อ Sheet ในไฟล์ของคุณคือ "DB_Projects" หรือ "Projects" ให้แก้ตรงนี้ให้ตรงกับชื่อแท็บจริงครับ
    const sheet = ss.getSheetByName('DB_Projects'); 
    
    if (!sheet) {
      throw new Error('ไม่พบ Sheet ชื่อ "DB_Projects" กรุณาตรวจสอบชื่อแท็บ');
    }

    // 1. สร้าง Project ID (ตัวอย่าง: P- ตามด้วยเวลาปัจจุบัน)
    const timestamp = new Date().getTime().toString().slice(-4); 
    const random = Math.floor(Math.random() * 100);
    const projectId = 'P-' + timestamp + random; // เช่น P-453299

    // 2. จัดเตรียมข้อมูลลง Array (เรียงตามคอลัมน์ใน CSV เป๊ะๆ)
    // [0]Project_ID, [1]Customer_Name, [2]Product, [3]AE_Owner, [4]Budget, 
    // [5]Contract_Period, [6]Target_Content_Qty, [7]Target_VDO_Qty, [8]GoogleSheet_Link, 
    // [9]Project_Status, [10]Billing_Status, [11]Target_Admin, [12]Target_Ads, 
    // [13]Target_Web, [14]Remark, [15]Target_Graphic_Qty

    const newRowData = [
      projectId,                  // [0] Project_ID
      data.customerName,          // [1] Customer_Name
      data.product,               // [2] Product
      data.aeOwner,               // [3] AE_Owner
      data.budget,                // [4] Budget
      data.period,                // [5] Contract_Period
      data.targetContent || 0,    // [6] Target_Content_Qty
      data.targetVDO || 0,        // [7] Target_VDO_Qty
      data.sheetLink,             // [8] GoogleSheet_Link
      'Active',                   // [9] Project_Status (Default = Active)
      'Pending',                  // [10] Billing_Status (Default = Pending) ** แก้ไขจุดนี้ให้ตรง CSV
      data.targetAdmin || 0,      // [11] Target_Admin
      data.targetAds || 0,        // [12] Target_Ads
      data.targetWeb || 0,        // [13] Target_Web
      data.remark,                // [14] Remark
      data.targetGraphic || 0     // [15] Target_Graphic_Qty
    ];

    // 3. บันทึกลง Sheet (ต่อท้ายแถวสุดท้าย)
    sheet.appendRow(newRowData);

    // 4. ส่งผลลัพธ์กลับไปหน้าเว็บ
    return { 
      success: true, 
      data: newRowData,
      message: "บันทึกโปรเจกต์สำเร็จ"
    };

  } catch (e) {
    return { 
      success: false, 
      message: "เกิดข้อผิดพลาด: " + e.message 
    };
  }
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
// ฟังก์ชันหลัก: บันทึก Content/Task (แก้ไขแล้ว: แก้บั๊กรูปหายตอน Edit)
// ฟังก์ชันหลัก: บันทึก Content/Task (ปรับปรุง: ใส่ผู้รับผิดชอบลง Workflow อัตโนมัติ + ไม่ลบของเก่าทิ้ง)
function saveContentTaskDB(data, fileData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("DB_Tasks");
  let taskId = data.taskId;
  let fileUrl = "";
  let fileName = "";

  // 1. จัดการไฟล์แนบ
  if (fileData) {
    try {
      var fileInfo = uploadFileToDrive(fileData);
      fileUrl = fileInfo.url;
      fileName = fileInfo.name;
    } catch(e) { }
  }

  // 2. ฟังก์ชันช่วยสร้าง Workflow ใหม่ (พร้อมใส่ชื่อคนรับผิดชอบ)
  const generateNewWorkflow = () => {
      try {
         var steps = getWorkflowTemplate(data.taskType || 'Content');
         
         // ✅ ไฮไลท์: ถ้ามีคนรับผิดชอบหลัก ให้ใส่ชื่อเขาลงไปในขั้นตอนเลย
         if (steps && steps.length > 0 && data.assignee && data.assignee !== 'Unassigned') {
             steps.forEach(step => {
                 // ใส่เฉพาะขั้นตอนที่ยังว่างอยู่
                 if (step.assignee === 'Unassigned') {
                     step.assignee = data.assignee;
                 }
             });
         }
         return JSON.stringify(steps);
      } catch(e) { return "[]"; }
  };

  let workflowJson = "";

  if (taskId) {
    // --- Edit Mode (แก้ไขงานเดิม) ---
    var dataRange = ws.getDataRange().getValues();
    for (var i = 1; i < dataRange.length; i++) {
      if (dataRange[i][0] == taskId) {
        
        // ⚠️ สำคัญ: เช็คก่อนว่ามี Workflow เดิมไหม? ถ้ามี "ห้ามสร้างทับ" (เดี๋ยวงานที่ทำไปแล้วหาย)
        let existingWorkflow = dataRange[i][12]; // Col M
        if (existingWorkflow && existingWorkflow.length > 5) { // เช็คคร่าวๆ ว่ามีข้อมูล
            workflowJson = existingWorkflow; 
        } else {
            // ถ้าของเดิมว่างเปล่า ค่อยสร้างใหม่
            workflowJson = generateNewWorkflow();
        }

        // อัปเดตข้อมูล
        ws.getRange(i + 1, 3).setValue(data.taskType);
        ws.getRange(i + 1, 4).setValue(data.taskName);
        ws.getRange(i + 1, 5).setValue(data.assignee); 
        ws.getRange(i + 1, 13).setValue(workflowJson); // Col M (Workflow)
        ws.getRange(i + 1, 14).setValue(data.pillar);  
        ws.getRange(i + 1, 15).setValue(data.mediaType); 
        ws.getRange(i + 1, 16).setValue(data.remark);    
        
        if (fileUrl) {
          ws.getRange(i + 1, 10).setValue(fileUrl);
          ws.getRange(i + 1, 11).setValue(fileName);
        } else {
          // ถ้าไม่ได้แนบใหม่ ให้ใช้ค่าเดิมส่งกลับไป
          fileUrl = dataRange[i][9];   
          fileName = dataRange[i][10]; 
        }
        break;
      }
    }
  } else {
    // --- New Mode (สร้างงานใหม่) ---
    taskId = "T-" + Math.floor(Math.random() * 1000000).toString(16);
    
    // สร้าง Workflow ใหม่
    workflowJson = generateNewWorkflow();

    const newRow = [
      taskId, data.projectId, data.taskType, data.taskName, data.assignee, 
      data.status, 0, data.dueDate, "", 
      fileUrl, fileName, "",          
      workflowJson, // [12] Workflow ที่ใส่ชื่อคนแล้ว
      data.pillar, 
      data.mediaType, 
      data.remark  
    ];
    ws.appendRow(newRow);
  }
  
  clearCache(); 
  
  return [
      taskId, data.projectId, data.taskType, data.taskName, data.assignee, 
      data.status, 0, data.dueDate, "", 
      fileUrl, fileName, "",           
      workflowJson, 
      data.pillar,  
      data.mediaType, 
      data.remark   
  ];
}

function saveContentTask() {
    // ✅ 1. จำค่าปุ่มกดไว้ทันทีที่ฟังก์ชันเริ่มทำงาน
    const btn = event.target; 

    const taskId = document.getElementById('content-task-id').value;
    const dateStr = document.getElementById('content-date').value;
    
    const data = {
        taskId: taskId,
        projectId: currentProjectId,
        dueDate: dateStr,
        taskName: document.getElementById('content-idea').value, 
        assignee: document.getElementById('content-assignee').value,
        pillar: document.getElementById('content-pillar').value,
        mediaType: document.getElementById('content-media').value,
        remark: document.getElementById('content-remark').value,
        taskType: 'Content', 
        status: 'To Do' 
    };
    
    const fileInput = document.getElementById('content-file');
    const file = fileInput.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            // ✅ 2. ส่งปุ่ม (btn) ไปด้วย
            submitToBackend(data, { name: file.name, mimeType: file.type, data: e.target.result.split(',')[1] }, btn);
        };
        reader.readAsDataURL(file);
    } else {
        // ✅ 2. ส่งปุ่ม (btn) ไปด้วย
        submitToBackend(data, null, btn);
    }
}

function submitToBackend(data, filePayload, btn) {
    // ใช้ btn ที่รับเข้ามาแทน event.target
    const originalText = btn.innerHTML; // จำข้อความเดิมไว้เผื่อ error
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    google.script.run.withSuccessHandler((res) => {
        // อัปเดตข้อมูลในตัวแปร globalData
        if (!data.taskId) {
            globalData.tasks.push(res); 
        } else {
            const idx = globalData.tasks.findIndex(t => t[0] === res[0]);
            if(idx !== -1) globalData.tasks[idx] = res;
        }
        
        // วาดตารางและ List ใหม่
        renderContentPlanView(); 
        
        if (currentProjectId) {
            const currentProjectTasks = globalData.tasks.filter(t => t[1] === currentProjectId);
            renderListView(currentProjectTasks);   
            renderKanbanView(currentProjectTasks); 
        }

        bootstrap.Modal.getInstance(document.getElementById('contentTaskModal')).hide();
        
        // คืนค่าปุ่ม
        btn.innerHTML = 'Save Content';
        btn.disabled = false;
        
    }).withFailureHandler((err) => {
        // กรณี Error ให้คืนค่าปุ่มด้วย
        alert("เกิดข้อผิดพลาด: " + err.message);
        btn.innerHTML = 'Save Content';
        btn.disabled = false;
    }).saveContentTaskDB(data, filePayload);
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

// ในไฟล์ code.gs (วางต่อท้ายสุดได้เลย)

function deleteTaskDB(taskId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("DB_Tasks");
  const data = ws.getDataRange().getValues();
  
  // ค้นหาแถวที่มี Task ID ตรงกัน
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == taskId) {
      ws.deleteRow(i + 1); // ลบแถวนั้นทิ้ง
      
      clearCache(); // ล้าง Cache
      return { success: true };
    }
  }
  
  return { success: false, message: "ไม่พบข้อมูลงานนี้ในระบบ" };
}

// ในไฟล์ code.gs

function saveWorkflowDB(taskId, workflowJson) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName("DB_Tasks");
  const data = ws.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == taskId) {
      // Index 12 คือ Column M (Workflow JSON)
      ws.getRange(i + 1, 13).setValue(workflowJson);
      
      clearCache();
      return { success: true };
    }
  }
  return { success: false, message: "Task not found" };
}

/**
 * ฟังก์ชันแก้ไขข้อมูลโปรเจค (Update)
 */
function updateProjectDB(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('DB_Projects'); // ตรวจสอบชื่อ Sheet ให้ตรง
    if (!sheet) throw new Error('ไม่พบ Sheet DB_Projects');

    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    // ค้นหาแถวที่ Project ID ตรงกัน (เริ่มหาจากแถวที่ 2)
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] == data.id) { // Column A is ID
        rowIndex = i + 1; // +1 เพราะ Row ใน Sheet เริ่มที่ 1
        break;
      }
    }

    if (rowIndex === -1) throw new Error('ไม่พบรหัสโปรเจคนี้ในฐานข้อมูล');

    // เตรียมข้อมูลใหม่ (ต้องระวังไม่ให้ทับ Status หรือ Billing Status ถ้าไม่ได้แก้)
    // เราจะอัปเดตเฉพาะคอลัมน์ที่อยู่ในฟอร์มแก้ไข
    
    // เรียงลำดับ Column ตาม CSV:
    // [1]Name, [2]Product, [3]AE, [4]Budget, [5]Period, [6]T.Content, [7]T.VDO, [8]Link
    // ... [11]Admin, [12]Ads, [13]Web, [15]Graphic
    
    // อัปเดตทีละ Cell เพื่อความชัวร์ หรือ setValues เป็นกลุ่ม
    const rowRange = sheet.getRange(rowIndex, 2, 1, 15); // เริ่ม Column 2 (B) ถึง 16 (P)
    const currentValues = values[rowIndex-1]; // ค่าเดิมใน DB

    // สร้าง Array ข้อมูลใหม่ผสมกับค่าเดิม (เผื่อบางค่าไม่ได้ส่งมา)
    const updateValues = [
      data.customerName,           // Col B [1]
      data.product,                // Col C [2]
      data.aeOwner,                // Col D [3]
      data.budget,                 // Col E [4]
      data.period,                 // Col F [5]
      data.targetContent || 0,     // Col G [6]
      data.targetVDO || 0,         // Col H [7]
      data.sheetLink,              // Col I [8]
      currentValues[9],            // Col J [9] Status (ไม่แก้จากฟอร์มนี้)
      currentValues[10],           // Col K [10] Billing (ไม่แก้จากฟอร์มนี้)
      data.targetAdmin || 0,       // Col L [11]
      data.targetAds || 0,         // Col M [12]
      data.targetWeb || 0,         // Col N [13]
      currentValues[14],           // Col O [14] Remark (ใช้ Modal แยก)
      data.targetGraphic || 0      // Col P [15]
    ];

    rowRange.setValues([updateValues]);

    // ส่งข้อมูลใหม่กลับไปอัปเดตหน้าเว็บ
    const updatedFullRow = [data.id, ...updateValues];
    return { success: true, data: updatedFullRow };

  } catch (e) {
    return { success: false, message: e.message };
  }
}
