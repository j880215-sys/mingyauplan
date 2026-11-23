/* ============================================================
   表單結構（依「A單位個案管理員 家庭訪視評估表」逐列對應）
   add:true  = 原評估表沒有、依計畫範例建議新增的欄位（僅供對照，畫面上不再標示）
   （115.11 起所有欄位全部展開，不再收合「更多選填」）
   ============================================================ */
var SCHEMA = (function () {
  var has = function (f, id, v) { var a = f[id]; return Array.isArray(a) ? a.indexOf(v) >= 0 : a === v; };
  var ADL3 = ['自理', '部分協助', '完全依賴'];

  var sections = [
    /* ---------------- 壹 ---------------- */
    { id: 'basic', group: '壹', nav: '訪視資訊', title: '壹、訪視基本資訊與長照核定摘要', rows: [
      { label: '訪視', fields: [
        { id: 'visitDate', type: 'date', label: '訪視日期' },
        { id: 'visitType', type: 'single', label: '訪視類型', options: ['初評', '出備初評', '複評'] },
        { id: 'withCM', type: 'single', label: '與照專一同家訪', options: ['是', '否'], add: true }
      ] },
      { label: '個案', fields: [
        { id: 'caseId', type: 'text', label: '個案編號', w: '7em', ph: '如 001' },
        { id: 'caseNo', type: 'text', label: 'CMS案號', w: '10em', ph: '如 111X19523' },
        { id: 'name', type: 'text', label: '個案姓名', w: '10em' },
        { id: 'gender', type: 'single', label: '性別', options: ['男', '女'] },
        { id: 'birthYear', type: 'byear', label: '出生年次／年齡' },
        { id: 'cms', type: 'single', label: 'CMS等級', options: ['2', '3', '4', '5', '6', '7', '8'], prefix: '第', suffix: '級' },
        { id: 'cmsAdj', type: 'multi', label: '', options: ['等級調整'] },
        { id: 'identity', type: 'single', label: '身分別', options: ['第一類', '第二類', '第三類'] },
        { id: 'address', type: 'text', label: '居住地址', w: '22em' },
        { id: 'phone', type: 'text', label: '聯絡電話', w: '12em', inputmode: 'tel' }
      ] },
      { label: '在場人員', hint: '會寫進「與個案○○、案女○○及致電案子○○討論照顧計畫」', fields: [
        { id: 'clientJoin', type: 'single', label: '個案本人參與討論', options: ['是', '否'] },
        { id: 'attendees', type: 'list', label: '家屬／其他參與者', addLabel: '新增參與者', item: [
          { id: 'rel', type: 'choice', label: '稱謂' },
          { id: 'name', type: 'text', label: '姓名', w: '8em' },
          { id: 'mode', type: 'single', label: '方式', options: ['在場', '致電'], def: '在場', add: true }
        ] }
      ] },
      { label: '個管員', fields: [
        { id: 'cmName', type: 'text', label: '個管員姓名', w: '10em', add: true, fromSetting: 'cmName' }
      ] }
    ] },

    /* ---------------- 貳-1 生理 ---------------- */
    { id: 'phys', group: '貳', nav: '1 生理面向', title: '貳、個案摘述【1. 生理面向】', preview: 'phys', rows: [
      { label: '(一) 疾病史、就醫與用藥', fields: [
        { id: 'dx', type: 'multi', label: '疾病史', note: true, noteHint: '可加備註，如「口服藥物控制」「108年手術」',
          options: ['高血壓', '糖尿病', '高血脂', '心臟病', '中風', { v: '失智症', cat: 1 }, '巴金森氏症', { v: '腎臟病', cat: 1 }, { v: '癌症', cat: 1 }, { v: '骨科疾病', cat: 1 }, { v: '精神疾病', cat: 1 }, '白內障'] },
        { id: 'dxOther', type: 'text', label: '其他疾病', ph: '以頓號分隔，如：心律不整、痛風', w: '100%' },
        { id: 'dxNote', type: 'textarea', label: '病史補充', rows: 2, ph: '發病或手術時間、近期住院、未提供診斷證明等，會接在病史後面', add: true },
        { id: 'disCard', type: 'single', label: '身心障礙證明', options: ['無', '有'], add: true },
        { id: 'disCat', type: 'multi', label: '障礙類別（新制，可複選）', options: DATA.disCats.map(function (c) { return { v: c[0], l: c[0] + '　' + c[1] }; }), showIf: function (f) { return f.disCard === '有'; }, add: true },
        { id: 'disLevel', type: 'single', label: '障礙等級', options: ['輕度', '中度', '重度', '極重度'], showIf: function (f) { return f.disCard === '有'; }, add: true },
        { id: 'disCardNote', type: 'text', label: '身障補充', w: '100%', ph: '如：舊制類別、有效期限、申請中', showIf: function (f) { return f.disCard === '有'; }, add: true },
        { type: 'inline', label: '回診狀況', parts: ['每', { id: 'followN', type: 'number', w: '4em' }, { id: 'followUnit', type: 'single', options: ['週', '月'], compact: 1 }, '回診'] },
        { id: 'hospital', type: 'text', label: '醫院／科別', w: '100%', ph: '如：輔大醫院神經內科' },
        { id: 'transport', type: 'multi', label: '就醫方式', other: true, options: [{ v: '自行前往', add: 1 }, { v: '家人開車接送', l: '家人接送' }, '計程車', '復康巴士', '長照交通(DA01)'] },
        { id: 'escort', type: 'choice', label: '陪同者', choices: ['居服員'].concat(DATA.relations) },
        { id: 'med', type: 'multi', label: '用藥狀況', options: ['自行拿取服用', '放入藥盒個案自行拿取', '他人拿藥給個案服用', { v: '需他人提醒督促', add: 1 }, '協助磨粉', '協助灌藥', { v: '未服用藥物', add: 1 }] },
        { id: 'medHelper', type: 'choice', label: '協助用藥者', choices: ['居服員'].concat(DATA.relations), add: true },
        { id: 'medRegular', type: 'single', label: '服藥規律性', options: ['規律', '偶爾忘記', '不規律'], add: true },
        { id: 'medNote', type: 'text', label: '藥物名稱／特殊處置', w: '100%' }
      ] },
      { label: '管路與特殊照護', add: true, fields: [
        { id: 'tubes', type: 'multi', label: '管路／處置', options: ['鼻胃管', '鼻腸管', '尿管', '氣切管', '腸造口', '膀胱造口', '洗腎廔管', '使用氧氣', '抽痰', '傷口換藥'], add: true },
        { id: 'tubeNote', type: 'textarea', label: '補充', rows: 2, ph: '如：由居護所居家換管；每週一、五洗腎', add: true }
      ] },
      { label: '疼痛', add: true, fields: [
        { id: 'painHas', type: 'single', label: '疼痛主訴', options: ['無', '有'], add: true },
        { id: 'painSite', type: 'text', label: '部位', w: '12em', showIf: function (f) { return f.painHas === '有'; }, add: true },
        { id: 'painScore', type: 'scale', label: '疼痛分數（0–10）', showIf: function (f) { return f.painHas === '有'; }, add: true },
        { id: 'painNote', type: 'text', label: '補充', w: '100%', ph: '如：疼痛發作時依醫囑服用止痛藥', showIf: function (f) { return f.painHas === '有'; }, add: true }
      ] },
      { label: '(二) 視聽力、意識與溝通', fields: [
        { id: 'vision', type: 'multi', label: '視力', options: ['正常', '近視', '老花', '白內障', '黃斑部病變', '可看清大字/電視', '視力模糊', '失明'] },
        { id: 'hearing', type: 'multi', label: '聽力', options: [{ v: '正常', l: '正常(可聽清個管問題)' }, '重聽', '使用助聽器'] },
        { id: 'conscious', type: 'single', label: '意識', options: ['清醒', '嗜睡', '混亂'] },
        { id: 'cognition', type: 'single', label: '認知', options: ['正常', '輕微退化', '失智'] },
        { id: 'comm', type: 'single', label: '溝通', options: ['可完整回覆', '簡短回覆', '點頭搖頭', '無口語/無法回覆'] },
        { id: 'lang', type: 'multi', label: '語言', other: true, options: ['國', '台', '客'] },
        { id: 'sensNote', type: 'textarea', label: '補充', rows: 2, ph: '如：經常會有文不對題或答非所問情形', add: true }
      ] },
      { label: '(三) 四肢行走、移位及活動', fields: [
        { id: 'limbs', type: 'multi', label: '四肢', options: ['四肢正常', '偏癱', '肌力退化'] },
        { id: 'hemiSide', type: 'multi', label: '偏癱側', options: ['左', '右'], showIf: function (f) { return has(f, 'limbs', '偏癱'); } },
        { id: 'weakPart', type: 'multi', label: '退化部位', options: ['上肢', '下肢'], showIf: function (f) { return has(f, 'limbs', '肌力退化'); }, add: true },
        { id: 'mp', type: 'muscle', label: '肌力（0–5分，選填）' },
        { id: 'gait', type: 'single', label: '步態', options: ['穩', { v: '尚穩', add: 1 }, '不穩需攙扶', '輪椅代步', '臥床'] },
        { id: 'gaitAssist', type: 'single', label: '協助程度', options: ['輕', '中', '重'], showIf: function (f) { return f.gait === '不穩需攙扶'; } },
        { id: 'walkAid', type: 'multi', label: '行走輔具', other: true, options: ['無需輔具', '單拐', '四腳拐', '助行器', '助步車', '輪椅'], add: true },
        { id: 'rise', type: 'single', label: '翻身起身', options: ['可自行', '需協助'], add: true },
        { id: 'transfer', type: 'single', label: '移位', options: ['可自行', { v: '需人協助', l: '需人協助(BA10)' }, '需人推輪椅'] },
        { id: 'stairs', type: 'single', label: '上下樓梯', options: ['可自行', { v: '需攙扶', l: '需攙扶(BA12)' }, '無法上下樓'] },
        { id: 'outdoor', type: 'single', label: '外出', options: ['可自行外出', '需有人陪同', '無法外出'], add: true },
        { id: 'fallHas', type: 'single', label: '近半年跌倒', options: ['無', '有'], add: true },
        { id: 'fallNote', type: 'text', label: '次數／傷勢', w: '100%', ph: '如：至少2次；右膝有破皮傷口已結痂', showIf: function (f) { return f.fallHas === '有'; }, add: true },
        { id: 'lostHas', type: 'single', label: '走失史', options: ['無', '有'], add: true },
        { id: 'lostNote', type: 'text', label: '走失補充', w: '100%', ph: '如：2年前曾走失，已申請失智手鍊', showIf: function (f) { return f.lostHas === '有'; }, add: true },
        { id: 'housework', type: 'single', label: '家務處理', options: ADL3 },
        { id: 'shopping', type: 'single', label: '購物', options: ADL3 },
        { id: 'shoppingNote', type: 'text', label: '購物協助內容', w: '14em', showIf: function (f) { return f.shopping === '部分協助'; } },
        { id: 'finance', type: 'single', label: '理財', options: ADL3 },
        { id: 'financeNote', type: 'text', label: '理財協助內容', w: '14em', showIf: function (f) { return f.finance === '部分協助'; } },
        { id: 'phoneUse', type: 'single', label: '使用電話', options: ADL3.concat(['可接聽', '可撥熟悉電話']), add: true },
        { id: 'mobNote', type: 'textarea', label: '補充', rows: 2, ph: '如：無法久走久站，途中需停下休息1至2次', add: true }
      ] },
      { label: '(四) 修容沐浴、排泄與皮膚', fields: [
        { id: 'groom', type: 'single', label: '修容(洗面/刷牙/刮鬍)', options: ['自理', '需部份協助', '需完全協助'] },
        { id: 'groomNote', type: 'text', label: '協助內容', w: '14em', showIf: function (f) { return f.groom === '需部份協助'; } },
        { id: 'dress', type: 'single', label: '穿脫衣物', options: ['自理', '需部份協助', '完全需他人協助'] },
        { id: 'dressHelp', type: 'multi', label: '協助內容', other: true, options: ['冷熱不分', '穿脫上衣', '穿脫下著'], showIf: function (f) { return f.dress === '需部份協助'; } },
        { id: 'bath', type: 'single', label: '沐浴', options: ['自行沐浴', '需部份協助', '完全需他人協助'] },
        { id: 'bathPose', type: 'single', label: '姿勢', options: ['站姿', '坐姿'], showIf: function (f) { return f.bath === '自行沐浴'; } },
        { id: 'bathAid', type: 'text', label: '使用輔具', w: '10em', ph: '如：沐浴椅', showIf: function (f) { return f.bath === '自行沐浴' && f.bathPose === '坐姿'; } },
        { id: 'bathPart', type: 'multi', label: '協助內容', other: true, options: ['後背', '下肢'], showIf: function (f) { return f.bath === '需部份協助'; } },
        { id: 'bathFull', type: 'multi', label: '方式', other: true, options: ['床上擦澡', '到宅沐浴車'], showIf: function (f) { return f.bath === '完全需他人協助'; } },
        { id: 'bathClean', type: 'single', label: '清潔度', options: ['良好', '欠佳'], add: true },
        { id: 'toilet', type: 'multi', label: '如廁方式（可複選）', options: ['可自行至廁所', '需他人協助如廁', '使用便盆椅', '臥床使用尿布', '預防性穿尿片'], add: true },
        { id: 'urine', type: 'multi', label: '解尿', options: ['自理', '尿布', '尿管', { v: '頻尿', add: 1 }, { v: '偶有滲尿或不及如廁', add: 1 }, { v: '失禁', add: 1 }] },
        { id: 'diaperHelp', type: 'multi', label: '', options: ['需清潔更換'], showIf: function (f) { return has(f, 'urine', '尿布'); } },
        { id: 'urineNote', type: 'text', label: '解尿補充', w: '100%' },
        { id: 'stool', type: 'multi', label: '解便', options: ['正常', '便秘', '腹瀉'] },
        { id: 'stoolNote', type: 'text', label: '解便補充', w: '100%' },
        { id: 'skin', type: 'multi', label: '皮膚', options: ['完整', '乾燥', '壓傷/傷口'] },
        { id: 'skinSite', type: 'text', label: '部位', w: '14em', showIf: function (f) { return has(f, 'skin', '壓傷/傷口'); } },
        { id: 'hygNote', type: 'textarea', label: '補充', rows: 2, ph: '如：個管建議使用沐浴椅但個案抗拒', add: true }
      ] },
      { label: '(五) 用餐與營養狀況', fields: [
        { id: 'mealBy', type: 'multi', label: '餐食來源', options: ['自行準備', '家屬準備', '外看準備', '外食/自行購買', '送餐服務'], add: true },
        { id: 'mealWho', type: 'choice', label: '備餐者', choices: ['居服員'].concat(DATA.relations), add: true },
        { id: 'eat', type: 'single', label: '進食能力', options: ['自行進食', '需備餐/切碎', '需協助餵食', '鼻胃管灌食'] },
        { id: 'tubeFeed', type: 'text', label: '灌食內容', w: '100%', ph: '如：每日管灌6次配方奶', showIf: function (f) { return f.eat === '鼻胃管灌食'; }, add: true },
        { id: 'teeth', type: 'multi', label: '牙口', options: ['正常', '缺牙', '假牙'] },
        { id: 'denture', type: 'multi', label: '假牙種類', options: ['活動假牙', '植入式假牙'], showIf: function (f) { return has(f, 'teeth', '假牙'); } },
        { type: 'inline', label: '餐食', parts: ['一天', { id: 'mealsDay', type: 'number', w: '4em' }, '餐；每餐約', { id: 'portion', type: 'text', w: '5em', ph: '半' }, '碗'] },
        { id: 'texture', type: 'multi', label: '食物質地', options: ['一般', '軟質', '細碎', '流質'] },
        { id: 'choke', type: 'single', label: '嗆咳情形', options: ['無', '偶爾', '頻繁'] },
        { id: 'chokeWhen', type: 'multi', label: '嗆咳時機', options: ['喝水', '進食'], showIf: function (f) { return f.choke === '偶爾' || f.choke === '頻繁'; } },
        { id: 'appetite', type: 'single', label: '食慾', options: ['良好', '普通', '較差'], add: true },
        { type: 'bmi', label: '體重與BMI' },
        { id: 'wtChange', type: 'single', label: '近期體重變化', options: ['穩定', '增加', '減少'] },
        { type: 'inline', label: '', showIf: function (f) { return f.wtChange === '增加' || f.wtChange === '減少'; }, parts: ['近', { id: 'wtMonths', type: 'number', w: '4em' }, '個月變化', { id: 'wtKg', type: 'number', w: '5em' }, 'kg'] },
        { id: 'nutrition', type: 'single', label: '營養狀況', options: ['無虞', '良好', '尚可', '不佳'], add: true },
        { id: 'eatNote', type: 'textarea', label: '補充', rows: 2, add: true }
      ] }
    ] },

    /* ---------------- 貳-2 心理 ---------------- */
    { id: 'psych', group: '貳', nav: '2 心理面向', title: '貳、個案摘述【2. 心理面向】', preview: 'psych', rows: [
      { label: '心理與動機', fields: [
        { id: 'mood', type: 'multi', label: '訪視當下情緒', options: ['平穩/配合', '開朗', '淡漠', '憂鬱/低落', '焦慮/易怒'] },
        { id: 'spirit', type: 'multi', label: '精神狀態（可複選）', options: ['佳', '疲倦', '嗜睡'] },
        { id: 'bpsd', type: 'multi', label: '行為精神症狀', options: ['無', '日夜顛倒', '抗拒照顧', '遊走', '重複問話', '藏物', '妄想/幻覺', '攻擊行為'], add: true },
        { id: 'familyRel', type: 'single', label: '家人互動', options: ['融洽緊密', '普通', '疏離/有衝突'] },
        { id: 'selfView', type: 'single', label: '對自身體況感受', options: ['樂觀', '接受現況', '無奈/失落', '否認退化'] },
        { id: 'motive', type: 'single', label: '接受服務/復能動機', options: ['高', '普通', '抗拒'] },
        { id: 'motiveWhy', type: 'text', label: '抗拒原因', w: '100%', showIf: function (f) { return f.motive === '抗拒'; } },
        { id: 'psyNote', type: 'textarea', label: '補充', rows: 3, ph: '如：案女表示個案因身體不舒服，情緒上有時會比較不耐煩', add: true }
      ] }
    ] },

    /* ---------------- 貳-3 家庭 ---------------- */
    { id: 'family', group: '貳', nav: '3 家庭狀況', title: '貳、個案摘述【3. 家庭狀況】', preview: 'family', rows: [
      { label: '(一) 家庭關係、照顧分工', fields: [
        { id: 'marital', type: 'single', label: '婚姻', options: ['已婚', '喪偶', '離婚', '已婚分居', '未婚'] },
        { type: 'inline', label: '子女', parts: ['育有', { id: 'sons', type: 'number', w: '4em' }, '子', { id: 'daughters', type: 'number', w: '4em' }, '女'] },
        { id: 'childOrder', type: 'text', label: '子女排序', w: '12em', ph: '如：女子女女', add: true },
        { id: 'living', type: 'single', label: '居住狀況', options: ['獨居', '與家人同住'], add: true },
        { id: 'livingWith', type: 'text', label: '同住者', w: '100%', ph: '如：案長子、案孫子、案孫女', showIf: function (f) { return f.living === '與家人同住'; }, add: true },
        { id: 'foreign', type: 'single', label: '外籍看護', options: ['無', '有'], add: true },
        { id: 'foreignNote', type: 'text', label: '外看補充', w: '100%', ph: '如：1位，每月休假4天', showIf: function (f) { return f.foreign === '有'; }, add: true },
        { id: 'members', type: 'list', label: '家庭成員（逐位填寫，產出為 (1)(2)(3) 條列）', addLabel: '新增家庭成員', card: true, add: true, item: [
          { id: 'rel', type: 'choice', label: '稱謂' },
          { id: 'name', type: 'text', label: '姓名（選填）', w: '8em' },
          { id: 'marital', type: 'single', label: '婚姻', options: ['已婚', '未婚', '離婚', '喪偶'] },
          { id: 'co', type: 'single', label: '同住', options: ['同住', '未同住'] },
          { id: 'place', type: 'text', label: '居住地', w: '10em', ph: '如：新莊', showIf: function (m) { return m.co !== '同住'; } },
          { id: 'work', type: 'single', label: '工作', options: ['正職工作', '兼職', '退休', '家管', '無業', '就學'] },
          { id: 'health', type: 'text', label: '健康／體況', w: '100%', ph: '如：有慢性病' },
          { id: 'roles', type: 'multi', label: '角色', options: ['主要照顧者', '主要聯絡人', '次要聯絡人', '主要決策者', '同為長照服務使用對象'] },
          { id: 'birthYear', type: 'byear', label: '出生年次／年齡', showIf: function (m) { return has(m, 'roles', '主要照顧者'); } },
          { id: 'visit', type: 'single', label: '探視', options: ['每天探視', '經常探視', '偶爾探視', '休假探視', '不定期探視', '多以電話聯繫', '幾乎無聯繫'], showIf: function (m) { return m.co !== '同住'; } },
          { id: 'note', type: 'textarea', label: '補充', rows: 2, ph: '可提供的協助、工作內容、照顧負荷主訴等' }
        ] },
        { id: 'income', type: 'multi', label: '經濟來源', options: ['子女奉養', '退休俸', '積蓄', '補助津貼'] },
        { id: 'incomeNote', type: 'text', label: '經濟補充', w: '100%' },
        { id: 'careShare', type: 'textarea', label: '案家照顧分工狀況（輪替或經濟支持情形）', rows: 2 },
        { id: 'genogram', type: 'sketch', label: '家系圖（可手繪，選填）' }
      ] },
      { label: '(二) 照顧負荷、決策與聯絡', hint: '主要照顧者、主聯絡人、主決策者請在上方家庭成員的「角色」勾選', fields: [
        { id: 'highBurden', type: 'multi', label: '高負荷初篩指標', options: ['65歲以上老老照顧', '照顧者罹患重病/身心疾', '同時照顧2人以上', '無替手資源', '獨自照顧>8時/日', '情緒極度焦慮/有輕生或施暴念頭'] },
        { id: 'burden', type: 'single', label: '負荷自評', options: ['低', '中', '高'] },
        { id: 'burdenRef', type: 'multi', label: '支持', options: ['需轉介家照據點', '需申請G碼喘息'] },
        { id: 'fcWill', type: 'single', label: '家庭照顧者服務意願', options: ['有意願', '婉拒'], add: true },
        { id: 'community', type: 'multi', label: '社區/信仰支持', other: true, options: ['教會', '廟宇', '里長/鄰里', 'C據點', '失智據點'] },
        { id: 'support', type: 'single', label: '家庭支持度', options: ['佳', '良好', '普通', '較差'], add: true },
        { id: 'famNote', type: 'textarea', label: '補充', rows: 2, add: true }
      ] }
    ] },

    /* ---------------- 貳-4 居家環境 ---------------- */
    { id: 'home', group: '貳', nav: '4 居家環境', title: '貳、個案摘述【4. 居家環境】', preview: 'home', rows: [
      { label: '住宅與外部動線環境', fields: [
        { id: 'tenure', type: 'single', label: '住宅產權', options: ['自有', '借住', '租賃', '貸款'] },
        { id: 'tenureOwner', type: 'text', label: '房屋所有人與個案關係', w: '10em', showIf: function (f) { return f.tenure === '借住'; } },
        { id: 'rent', type: 'text', label: '租金（每月）', w: '8em', suffix: '元', showIf: function (f) { return f.tenure === '租賃'; } },
        { id: 'utilNote', type: 'text', label: '水電網路第四台每月支出概況', w: '100%', showIf: function (f) { return f.tenure === '租賃'; } },
        { id: 'loan', type: 'text', label: '貸款（每月）', w: '8em', suffix: '元', showIf: function (f) { return f.tenure === '貸款'; } },
        { id: 'building', type: 'single', label: '建築形式', options: ['電梯社區公寓', '電梯華廈', '舊式無電梯公寓', '透天'] },
        { id: 'floor', type: 'text', label: '樓層', w: '5em', suffix: '樓', showIf: function (f) { return f.building && f.building !== '透天'; } },
        { type: 'inline', label: '', showIf: function (f) { return f.building === '透天'; }, parts: ['共', { id: 'floorsTotal', type: 'number', w: '4em' }, '層，主要活動', { id: 'floorMain', type: 'text', w: '4em' }, '樓'] },
        { id: 'outside', type: 'single', label: '外部環境與階梯', options: ['平坦無障礙', '社區/大門有階梯'] },
        { type: 'inline', label: '', showIf: function (f) { return f.outside === '社區/大門有階梯'; }, parts: ['共約', { id: 'steps', type: 'number', w: '4em' }, '階'] },
        { id: 'stepPass', type: 'single', label: '通過狀況', options: ['可攙扶上下', '無法通行'], showIf: function (f) { return f.outside === '社區/大門有階梯'; } },
        { id: 'needClimber', type: 'multi', label: '', options: ['需評估爬梯機'], showIf: function (f) { return f.outside === '社區/大門有階梯'; } }
      ] },
      { label: '室內空間與輔具盤點', fields: [
        { id: 'entry', type: 'single', label: '大門玄關/動線', options: ['寬敞無阻礙', '狹窄/堆放雜物'] },
        { id: 'threshold', type: 'single', label: '主要活動空間', options: ['無高低差', '有門檻'] },
        { type: 'inline', label: '', showIf: function (f) { return f.threshold === '有門檻'; }, parts: ['約', { id: 'thresholdCm', type: 'text', w: '5em' }, 'cm，使用輔具', { id: 'thresholdPass', type: 'single', options: ['可', '不可'], compact: 1 }, '通行'] },
        { id: 'light', type: 'single', label: '採光照明', options: ['足', '暗'] },
        { id: 'bed', type: 'multi', label: '臥室床型', options: [{ v: '單人床', add: 1 }, { v: '雙人床', add: 1 }, '照顧床', { v: '和室地板', add: 1 }] },
        { id: 'bedRail', type: 'single', label: '床邊扶手', options: ['有', '無'], add: true },
        { id: 'bedFlow', type: 'single', label: '臥室動線', options: ['順暢', '狹小'] },
        { id: 'bathEnv', type: 'multi', label: '衛浴', options: ['乾濕分離', { v: '無乾濕分離', add: 1 }, '有扶手', '有防滑墊', '無扶手/地面濕滑易跌', { v: '有浴缸', add: 1 }, { v: '有門檻', add: 1 }] },
        { id: 'aidsHave', type: 'multi', label: '已備有輔具', other: true, options: ['拐杖/四腳拐', '助行器', '輪椅', '氣墊床', '照顧床', '便盆椅', '洗澡椅'] },
        { id: 'aidsNeed', type: 'single', label: '需申購/評估', options: ['無', '有'] },
        { id: 'aidsNeedNote', type: 'text', label: '需求項目', w: '100%', ph: '如：爬梯機、衛浴扶手、沐浴椅', showIf: function (f) { return f.aidsNeed === '有'; } },
        { id: 'homeNote', type: 'textarea', label: '補充', rows: 2, ph: '如：與案孫女同睡一間臥室；家中飼有狗', add: true }
      ] }
    ] },

    /* ---------------- 貳-5 生活作息 ---------------- */
    { id: 'routine', group: '貳', nav: '5 生活作息', title: '貳、個案摘述【5. 生活作息】', preview: 'routine', rows: [
      { label: '生活作息與特殊事宜', fields: [
        { id: 'regular', type: 'single', label: '作息', options: ['規律', '不規律'], add: true },
        { type: 'inline', label: '基本作息（時）', parts: ['起床', { id: 'tWake', type: 'text', w: '4em' }, '早餐', { id: 'tBreakfast', type: 'text', w: '4em' }, '午餐', { id: 'tLunch', type: 'text', w: '4em' }, '午休', { id: 'tNap', type: 'text', w: '4em' }, '晚餐', { id: 'tDinner', type: 'text', w: '4em' }, '就寢', { id: 'tSleep', type: 'text', w: '4em' }] },
        { id: 'sleep', type: 'single', label: '夜間睡眠', options: [{ v: '佳', add: 1 }, { v: '尚可', l: '尚可/正常' }, { v: '不佳', l: '不佳/失眠' }, '日夜顛倒'] },
        { id: 'sleepNote', type: 'text', label: '睡眠補充', w: '100%', ph: '如：夜間會起來5次；有服用安眠藥物', add: true },
        { id: 'daytime', type: 'multi', label: '白天主要活動', other: true, options: ['看電視', '滑手機', '外出散步', '臥床休息', '坐輪椅/椅子上', '做家務'], add: true },
        { id: 'interests', type: 'text', label: '興趣/社交', w: '100%', ph: '如：週末固定由家人陪同到教會禮拜；目前無休閒活動' },
        { id: 'special', type: 'textarea', label: '特殊照顧事宜（特定時段需沐浴/餵食、禁忌、寵物、門禁方式、家屬最困擾之照顧痛點）', rows: 3 },
        { id: 'advice', type: 'textarea', label: '個管建議與個案/家屬回應', rows: 2, ph: '如：個管建議可讓個案至日照或據點活動，個案表示會再考慮', add: true }
      ] }
    ] },

    /* ---------------- 貳-6 使用服務情形 ---------------- */
    { id: 'svc', group: '貳', nav: '6 服務使用情形', title: '貳、個案摘述【6. 使用服務情形】', preview: 'svc', rows: [
      { label: '服務使用現況', fields: [
        { id: 'svcStatus', type: 'single', label: '使用服務狀況', options: ['新案尚未使用', '使用服務中個案'] },
        { id: 'curCare', type: 'multi', label: '【照顧服務】', options: ['暫未使用', '居家服務', '日照', '家庭托顧'], showIf: function (f) { return f.svcStatus === '使用服務中個案'; } },
        { id: 'curHome', type: 'text', label: '居家服務使用項目/頻率', w: '100%', showIf: function (f) { return f.svcStatus === '使用服務中個案' && has(f, 'curCare', '居家服務'); } },
        { type: 'inline', label: '日照', showIf: function (f) { return f.svcStatus === '使用服務中個案' && has(f, 'curCare', '日照'); }, parts: [{ id: 'curDayType', type: 'single', options: ['全日', '半日'], compact: 1 }, '，', { id: 'curDayN', type: 'number', w: '4em' }, '天/週', { id: 'curDayExtra', type: 'multi', options: ['社區式交通車', '社區式晚餐', '社區式沐浴'], compact: 1 }] },
        { type: 'inline', label: '家庭托顧', showIf: function (f) { return f.svcStatus === '使用服務中個案' && has(f, 'curCare', '家庭托顧'); }, parts: [{ id: 'curFosType', type: 'single', options: ['全日', '半日'], compact: 1 }, '，', { id: 'curFosN', type: 'number', w: '4em' }, '天/週', { id: 'curFosExtra', type: 'multi', options: ['社區式交通車', '社區式晚餐', '社區式沐浴'], compact: 1 }] },
        { id: 'curPro', type: 'single', label: '【專業服務】', options: ['暫未使用', '使用服務中'], showIf: function (f) { return f.svcStatus === '使用服務中個案'; } },
        { id: 'curProNote', type: 'text', label: '服務項目；復能目標；期程；復能進度', w: '100%', showIf: function (f) { return f.svcStatus === '使用服務中個案' && f.curPro === '使用服務中'; } },
        { id: 'curTrans', type: 'single', label: '【交通接送服務】', options: ['暫未使用', '回診時使用'], showIf: function (f) { return f.svcStatus === '使用服務中個案'; } },
        { id: 'curAids', type: 'single', label: '【輔具及無障礙環境改善】', options: ['暫未使用', '使用中'], showIf: function (f) { return f.svcStatus === '使用服務中個案'; } },
        { id: 'curAidsNote', type: 'text', label: '使用內容', w: '100%', showIf: function (f) { return f.svcStatus === '使用服務中個案' && f.curAids === '使用中'; } },
        { id: 'curRespite', type: 'single', label: '【喘息服務/短照服務】', options: ['暫未使用', '照顧者休息時預約使用'], showIf: function (f) { return f.svcStatus === '使用服務中個案'; } },
        { id: 'curOther', type: 'multi', label: '【其他】', other: true, options: ['暫未使用', 'ZF01緊急救援通報系統服務', 'ZF02家庭照顧者服務'], showIf: function (f) { return f.svcStatus === '使用服務中個案'; } }
      ] },
      { label: '服務評值', showIf: function (f) { return f.svcStatus === '使用服務中個案'; }, fields: [
        { id: 'evFit', type: 'single', label: '服務內容是否符合目前期待', options: ['是', '否'] },
        { id: 'evFitWhy', type: 'text', label: '原因', w: '100%', showIf: function (f) { return f.evFit === '否'; } },
        { id: 'evAtt', type: 'single', label: '照顧服務人員服務態度是否良好', options: ['是', '否'] },
        { id: 'evAttWhy', type: 'text', label: '原因', w: '100%', showIf: function (f) { return f.evAtt === '否'; } },
        { id: 'evRelief', type: 'single', label: '是否減輕照顧負荷', options: ['是', '否'] },
        { id: 'evReliefWhy', type: 'text', label: '原因', w: '100%', showIf: function (f) { return f.evRelief === '否'; } },
        { id: 'evOther', type: 'textarea', label: '其他意見', rows: 2 }
      ] },
      { label: '本次討論', add: true, hint: '期望使用的服務項目請到「肆、服務規劃」選取，這裡會自動帶入摘要', fields: [
        { id: 'discussWith', type: 'text', label: '討論對象', w: '100%', ph: '留空則帶入在場人員，如：案女及案孫女', add: true },
        { id: 'svcReason', type: 'textarea', label: '需求說明／期待', rows: 2, ph: '如：為讓個案有規律作息', add: true },
        { id: 'svcNote', type: 'textarea', label: '補充', rows: 2, ph: '如：若有計畫調整需求會再來電討論', add: true }
      ] }
    ] },

    /* ---------------- 參、肆、產出 ---------------- */
    { id: 'problems', group: '參', nav: '照顧問題', title: '參、照顧問題', custom: 'problems', preview: 'problems', add: true },
    { id: 'plan', group: '肆', nav: '服務規劃', title: '討論後服務使用內容（計畫執行規劃）', custom: 'plan', preview: 'plan' },
    { id: 'goals', group: '肆', nav: '計畫目標', title: '肆、照顧計畫目標', custom: 'goals', preview: 'goals', add: true },
    { id: 'output', group: '產出', nav: '產生計畫', title: '產生 CMS 照顧計畫', custom: 'output' }
  ];

  /* ============================================================
     AA01：依「量表-照顧計畫」AA01 寫法。貳、參、肆與撰寫計畫同格式，
     個案摘述改為與上次訪視比較；服務規劃、照顧問題、計畫目標沿用撰寫計畫的元件
     ============================================================ */
  function pick(id) {
    for (var i = 0; i < sections.length; i++) {
      var rows = sections[i].rows || [];
      for (var j = 0; j < rows.length; j++) for (var k = 0; k < rows[j].fields.length; k++) if (rows[j].fields[k].id === id) return rows[j].fields[k];
    }
    return null;
  }
  var TREND = ['維持', '進步', '退步'];
  function aspect(id, label, ph) {
    return { label: label, fields: [
      { id: id, type: 'single', label: '與上次比較', options: TREND },
      { id: id + 'Note', type: 'text', label: '補充說明', w: '100%', ph: ph }
    ] };
  }
  var isKeep = function (f) { return f.aaFreq === '維持不變'; }, isAdj = function (f) { return f.aaFreq === '調整'; };
  function aaDetail(c) {
    var on = function (f) { return has(f, 'aaNoteItems', '核定' + c); }, k = 'aa' + c.slice(2);
    return { label: '核定' + c, showIf: on, fields: [
      { id: k + 'Date', type: 'date', label: '訪談時間' },
      { id: k + 'Who', type: 'text', label: '提出對象', w: '10em', ph: '如：案女' },
      { id: k + 'Reason', type: 'textarea', label: '原因（依據 6 大項何項原則）', rows: 2, ph: '如：個案獨居且主要照顧者因病住院，符合第○項原則' },
      { id: k + 'JK', type: 'text', label: '評估量表 J、K 項目（地方政府審視認有需要者填寫）', w: '100%', ph: '如：J2、K3' }
    ] };
  }
  var aaSections = [
    { id: 'aBasic', group: '壹', nav: '訪視資訊', title: '壹、訪視資訊', rows: [
      { label: '訪視', fields: [pick('visitDate'), pick('withCM')] },
      { label: '個案', fields: [pick('caseId'), pick('caseNo'), pick('name'), pick('cms'), pick('identity')] },
      sections[0].rows.filter(function (r) { return r.label === '在場人員'; })[0],
      { label: '個管員', fields: [pick('cmName')] }
    ] },
    { id: 'aStatus', group: '貳', nav: '1 個案概況', title: '貳、個案摘述【1. 個案概況】', rows: [
      aspect('aaPhys', '生理面向', '如：下肢較前次無力，室內需持助行器行走'),
      aspect('aaPsych', '心理面向', '如：情緒平穩，記憶力退化情形無明顯變化'),
      aspect('aaHome', '居家環境', '如：浴室已加裝扶手'),
      aspect('aaHabit', '生活習慣', '如：白天多在客廳看電視，午睡時間變長'),
      { label: '自理能力／前次問題追蹤', fields: [{ id: 'aaStatusNote', type: 'textarea', label: '補充（選填）', rows: 2, ph: '個案自理能力及前一份計畫照顧問題的追蹤情形' }] }
    ] },
    { id: 'aCarer', group: '貳', nav: '2 照顧者狀況', title: '貳、個案摘述【2. 照顧者照顧狀況】', rows: [
      { label: '主要照顧者', fields: [
        { id: 'aaCarerRel', type: 'choice', label: '主要照顧者', choices: ['外籍看護', '居服員'].concat(DATA.relations) },
        { id: 'aaCarerLoad', type: 'single', label: '照顧負荷', options: ['可承受', '稍有負荷', '負荷沉重'] }
      ] },
      { label: '其他家屬', fields: [
        { id: 'aaHelp', type: 'single', label: '可提供協助', options: ['有', '無'] },
        { id: 'aaHelpNote', type: 'text', label: '協助內容', w: '100%', ph: '如：案子假日會回家協助陪同就醫', showIf: function (f) { return f.aaHelp === '有'; } }
      ] },
      { label: '補充', fields: [{ id: 'aaCarerNote', type: 'textarea', label: '補充（選填）', rows: 2, ph: '如：案女近期工作較忙，主訴照顧壓力增加' }] }
    ] },
    { id: 'aSvc', group: '貳', nav: '3 服務使用狀況', title: '貳、個案摘述【3. 服務使用狀況】', rows: [
      { label: '服務頻率', fields: [{ id: 'aaFreq', type: 'single', label: '這次服務頻率', options: ['維持不變', '調整'] }] },
      { label: '目前使用情形', showIf: isKeep, fields: [
        { id: 'aaUseTime', type: 'text', label: '使用服務時間', w: '16em', ph: '如：每週一三五上午' },
        { id: 'aaUseContent', type: 'textarea', label: '使用服務內容', rows: 2, ph: '如：協助個案沐浴洗頭及備餐' },
        { id: 'aaWorker', type: 'single', label: '居服員服務狀況', options: ['服務狀況良好', '服務尚可', '需再溝通'] },
        { id: 'aaWorkerNote', type: 'text', label: '居服員補充', w: '100%', ph: '如：居服員準時到班，與個案互動良好' },
        { id: 'aaCoop', type: 'single', label: '個案配合照顧', options: ['配合度佳', '配合度尚可', '偶有抗拒'] }
      ] },
      { label: '調整後期待', showIf: isAdj, fields: [
        { id: 'aaExpect', type: 'textarea', label: '討論後期待使用的服務項目及頻率', rows: 2, ph: '如：增加每週二四BA07協助沐浴及洗頭各1單位' },
        { id: 'aaImprove', type: 'text', label: '期望改善事項', w: '100%', ph: '如：改善個案身體清潔狀況' }
      ] },
      { label: '補充', fields: [{ id: 'aaSvcNote', type: 'textarea', label: '補充（選填）', rows: 2 }] }
    ] },
    { id: 'problems', group: '參', nav: '照顧問題', title: '參、照顧問題（勾選並排序前 5 項）', custom: 'problems' },
    { id: 'plan', group: '肆', nav: '服務規劃', title: '討論後服務使用內容（計畫執行規劃）', custom: 'plan' },
    { id: 'goals', group: '肆', nav: '計畫目標', title: '肆、照顧計畫目標', custom: 'goals' },
    { id: 'aNote', group: '備註', nav: '其他備註', title: '其他備註', rows: [
      { label: '項目', fields: [{ id: 'aaNoteItems', type: 'multi', label: '需註記的項目（可複選）', options: ['核定AA08', '核定AA09', '超額自費需求'] }] },
      aaDetail('AA08'), aaDetail('AA09'),
      { label: '超額自費', showIf: function (f) { return has(f, 'aaNoteItems', '超額自費需求'); }, fields: [
        { id: 'aaSelfPay', type: 'single', label: '個案是否同意自費使用', options: ['同意自費', '不同意自費', '考慮中'] }
      ] },
      { label: '其他', fields: [{ id: 'aaNoteFree', type: 'textarea', label: '其他註記（選填）', rows: 2 }] }
    ] },
    { id: 'output', group: '產出', nav: '產生計畫', title: '產生 AA01 計畫', custom: 'output' }
  ];

  return { sections: sections, aaSections: aaSections, has: has };
})();
