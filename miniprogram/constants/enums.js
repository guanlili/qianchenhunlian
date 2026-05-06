/**
 * 业务枚举
 *
 * ⚠️ 这里的枚举必须与后端保持同步:
 *    qianchenhunlian_server/backend/app/models.py
 * 后端有任何变更, 同时改这里
 */

const eduOptions = [
  '不限',
  '小学/初中',
  '中专/高中',
  '大专',
  '本科',
  '硕士',
  '博士及以上',
];

const incomeOptions = [
  '不限',
  '3万以下',
  '3-5万',
  '5-7万',
  '7-10万',
  '10-15万',
  '15-20万',
  '20-30万',
  '30-50万',
  '50-100万',
  '100万以上',
];

const houseOptions = ['不限', '有婚房', '无婚房', '有购房计划'];
const marriageOptions = ['不限', '未婚', '离异未育', '离异已育'];
const carOptions = ['不限', '有车', '无车'];
const bodyTypeOptions = ['不限', '偏瘦', '苗条', '匀称', '适中', '中等', '偏胖'];

const relationOptions = ['父母', '本人', '朋友', '亲戚'];

const jobOptions = [
  '公务员',
  '会计',
  '国企员工',
  '销售',
  '事业单位',
  '建筑工程师',
  '教师',
  '律师',
  '医生',
  '银行职员',
  '护士',
  '军人',
  '软件开发工程师',
  '个体经营者',
  '设计师',
  '金融从业者',
  '自由职业者',
  '互联网职员',
  '央企员工',
  '公共服务人员',
];

const traits = [
  '孝顺',
  '成熟',
  '谦虚',
  '幽默',
  '热情',
  '温文尔雅',
  '踏实',
  '细心',
  '开朗',
  '真诚',
  '正直',
  '顾家',
];

const advantages = [
  '有上进心',
  '有车',
  '家教好',
  '家乡有房',
  '会做家务',
  '不抽烟喝酒',
  '收入稳定',
  '身体健康',
  '学历高',
  '工作稳定',
];

const requirements = [
  '本地优先',
  '收入稳定',
  '体贴',
  '学历相符',
  '门当户对',
  '顾家',
  '性格温和',
  '身高相符',
  '无不良嗜好',
  '孝顺父母',
];

const verifyStatus = {
  none: '未认证',
  pending: '审核中',
  passed: '已认证',
  rejected: '认证未通过',
};

const auditStatus = {
  pending: '审核中',
  approved: '已通过',
  rejected: '审核未通过',
};

module.exports = {
  eduOptions,
  incomeOptions,
  houseOptions,
  marriageOptions,
  carOptions,
  bodyTypeOptions,
  relationOptions,
  jobOptions,
  traits,
  advantages,
  requirements,
  verifyStatus,
  auditStatus,
};
