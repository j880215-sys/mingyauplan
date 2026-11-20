/* 測試用虛構個案（姓名皆為虛構），情境分別對應範例 1（日照+交通+喘息）與範例 3（居服+交通+其他） */
module.exports = {
  dayCare: {
    visitDate: '2026-11-10', visitType: '初評', withCM: '否', name: '林阿嬌', gender: '女', birthYear: '33', cms: '2', identity: '第三類',
    address: '新北市泰山區', clientJoin: '是', cmName: '測試個管',
    attendees: [{ rel: '案女', name: '林美惠', mode: '在場' }, { rel: '案孫女', name: '張小安', mode: '在場' }],
    dx: ['失智症', '高血壓'], dx__note: { '失智症': '阿茲海默症(未提供診斷證明書及身障證明)' }, dxOther: '心臟肥大、心律不整、白內障術後',
    hospital: '輔大醫院', transport: ['計程車'], escort: '案女', med: ['需他人提醒督促'], medHelper: '案女', medRegular: '不規律',
    vision: ['正常'], hearing: ['正常'], conscious: '清醒', cognition: '失智', comm: '可完整回覆', sensNote: '但因阿茲海默症影響，經常會有文不對題或答非所問情形',
    limbs: ['四肢正常'], gait: '尚穩', walkAid: ['無需輔具'], outdoor: '可自行外出', fallHas: '無', lostHas: '有', lostNote: '2年前，案家已申請失智手鍊',
    shopping: '自理', finance: '自理',
    groom: '自理', dress: '自理', bath: '自行沐浴', toilet: '可自行至廁所', urine: ['自理'], stool: ['正常'],
    mealBy: ['家屬準備', '外食/自行購買'], mealWho: '案女', eat: '自行進食', texture: ['軟質'], height: '150', weight: '56.9', nutrition: '無虞',
    mood: ['平穩/配合'], spirit: '佳', bpsd: ['無'], psyNote: '個案記憶力不佳，經常忘東忘西',
    marital: '喪偶', sons: '2', daughters: '4', childOrder: '女子女女女子', living: '與家人同住', livingWith: '案長子、案孫子、案孫女',
    members: [
      { rel: '案長子', marital: '離婚', co: '同住', health: '體況不佳，整日臥床', roles: ['同為長照服務使用對象'], note: '無法提供照顧' },
      { rel: '案次女', marital: '已婚', co: '未同住', place: '附近', roles: ['主要照顧者', '主要聯絡人'], birthYear: '70', visit: '每天探視', note: '會提醒個案用藥' },
      { rel: '案長女', marital: '已婚', co: '未同住', place: '北投', work: '正職工作', visit: '休假探視' }
    ],
    burden: '低', support: '佳',
    tenure: '自有', building: '舊式無電梯公寓', floor: '1', entry: '狹窄/堆放雜物', bed: ['雙人床'], aidsNeed: '無', homeNote: '與案孫女同睡一間臥室',
    regular: '不規律', daytime: ['看電視'], interests: '目前無休閒活動', advice: '經個管與案女討論後，建議可讓個案至日照活動或是據點活動',
    svcStatus: '新案尚未使用', svcReason: '為讓個案有規律作息',
    problems: [{ no: 30, name: '困擾行為', desc: '個案有阿茲海默症，平時無規律作息。' }, { no: 11, name: '購物或外出問題', desc: '個案有阿茲海默症，有固定外出就醫安排，需有人協助陪同就醫' }],
    pCare: [
      { code: 'BB01', name: '日間照顧（全日）--第1型', mode: 'week', n: 3, each: '1', note: '' },
      { code: 'BB02', name: '日間照顧（半日）--第1型', mode: 'spare', note: '個案有狀況無法整日安排日照服務時使用' }
    ],
    pTrans: '使用', pTransAmt: '1840', pVendors: ['亞捷', '捷安', '金永'],
    pRespite: [{ code: 'GA03', name: '日間照顧中心喘息服務--全日', units: '25' }, { code: 'GA04', name: '日間照顧中心喘息服務--半日', units: '1' }],
    pRespitePeriod: '115.11-116.10'
  },
  homeCare: {
    visitDate: '2026-10-20', withCM: '是', name: '王大同', clientJoin: '是', cmName: '測試個管',
    attendees: [{ rel: '案兄', name: '王大明', mode: '在場' }, { rel: '案女', name: '王小華', mode: '致電' }],
    dx: ['高血壓', '心臟病', '中風'], hospital: '輔大醫院泌尿科及神經科', med: ['自行拿取服用'],
    tubes: ['尿管'], tubeNote: '主訴尿管裝著很不舒服',
    limbs: ['肌力退化'], weakPart: ['下肢'], gait: '不穩需攙扶', gaitAssist: '輕', walkAid: ['助行器'], outdoor: '需有人陪同', fallHas: '有', fallNote: '多次',
    bath: '需部份協助', bathPart: ['後背', '下肢'], groom: '自理', dress: '自理',
    marital: '已婚', sons: '1', daughters: '1', childOrder: '子女', living: '與家人同住', livingWith: '案二兄',
    probCause: '下肢無力',
    problems: [{ no: 2, name: '洗澡問題', desc: '' }],
    pCare: [
      { code: 'BA07', name: '協助沐浴及洗頭', mode: 'week', n: 2, each: '1' },
      { code: 'BA13', name: '陪同外出', mode: 'week', n: 2, each: '2', unitsManual: true, units: '20', note: '陪同個案外出散步維護安全，多於單位陪同就醫時使用' },
      { code: 'BA14', name: '陪同就醫', mode: 'spare' },
      { code: 'BA15-1', name: '家務協助(自用)', mode: 'days', days: [2, 4], each: '1', note: '協助個案衣物洗滌晾曬及臥室簡易清潔' },
      { code: 'BA20', name: '陪伴服務', mode: 'spare', note: '下雨時改在家中陪伴並督促運動' }
    ],
    careFlags: ['例假日服務需求'],
    pTrans: '使用', pVendors: ['北台灣', '金永'],
    pOther: [{ code: 'OT01', name: '營養餐飲', mode: 'days', days: [1, 2, 3, 4, 5], each: '2', note: '午餐及晚餐，持續使用送餐服務' }]
  },
  foreign: {
    visitDate: '2026-10-15', withCM: '否', name: '陳阿滿', cmName: '測試個管', attendees: [{ rel: '案女', name: '陳小玲', mode: '在場' }],
    foreign: '有', careFlags: ['聘有外籍看護'],
    pRespite: [{ code: 'GA09', name: '居家喘息服務', units: '63' }], pRespitePeriod: '115.10-116.09',
    pShort: [{ code: 'SC09', name: '居家短照服務', units: '93' }], pShortPeriod: '115.10-116.09'
  }
};
