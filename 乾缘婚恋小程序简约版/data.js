// Shared data for the 乾缘婚恋 prototype
window.APP_DATA = {
  profiles: [
    {
      id: '53366922',
      gender: '女', year: 1987, age: 39, height: 163,
      edu: '小学/初中', origin: '天津', location: '德州',
      job: '国企员工', income: '3-5万', marriage: '离异已育',
      hasHouse: '有婚房', bodyType: '适中',
      hometown: '德州', likes: 0, hot: 116,
      desc: '我家女儿，出生于87年，身高163厘米，学历小学/初中，目前居住在德州，职业国企员工，踏实顾家，希望对方稳重可靠，欢迎和我联系。',
      wants: { year: '1982-1987', income: '不限', height: '170-188', house: '不限', edu: '中专/高中', marriage: '离异未育', origin: '德州', location: '德州' },
      avatar: '女1'
    },
    {
      id: '31821616',
      gender: '女', year: 1991, age: 35, height: 160,
      edu: '小学/初中', origin: '德州', location: '德州德城区',
      job: '销售', income: '5-7万', marriage: '未婚',
      hasHouse: '无婚房', bodyType: '匀称',
      hometown: '德州', likes: 12, hot: 204,
      desc: '我家女儿，出生于91年，身高160厘米，学历小学/初中，目前居住在德州德城区，职业销售，性格开朗，希望找个踏实的人。',
      wants: { year: '1985-1991', income: '5-7万以上', height: '168-185', house: '有婚房', edu: '不限', marriage: '未婚', origin: '德州', location: '德州' },
      avatar: '女2'
    },
    {
      id: '47291038',
      gender: '男', year: 1989, age: 37, height: 175,
      edu: '本科', origin: '淄博桓台县', location: '北京东城区',
      job: '软件开发工程师', income: '30-50万', marriage: '未婚',
      hasHouse: '有婚房', bodyType: '偏瘦',
      hometown: '淄博', likes: 28, hot: 389,
      desc: '我儿子，89年出生，身高175厘米，本科毕业，目前在北京工作，软件工程师，性格温和顾家，希望找一位善良贤惠的姑娘。',
      wants: { year: '1988-1995', income: '不限', height: '158-170', house: '不限', edu: '本科', marriage: '未婚', origin: '不限', location: '北京' },
      avatar: '男1'
    },
    {
      id: '68402957',
      gender: '男', year: 1985, age: 41, height: 178,
      edu: '大专', origin: '河北石家庄', location: '北京朝阳区',
      job: '公务员', income: '15-20万', marriage: '离异未育',
      hasHouse: '有婚房', bodyType: '中等',
      hometown: '石家庄', likes: 19, hot: 267,
      desc: '我侄子，85年出生，178厘米，公务员，人踏实上进，离异未育，希望重新寻找合适的另一半，诚心以待。',
      wants: { year: '1987-1995', income: '不限', height: '160-172', house: '不限', edu: '大专', marriage: '未婚', origin: '不限', location: '北京' },
      avatar: '男2'
    },
    {
      id: '29475861',
      gender: '女', year: 1993, age: 33, height: 166,
      edu: '本科', origin: '山东济南', location: '济南历下区',
      job: '教师', income: '7-10万', marriage: '未婚',
      hasHouse: '无婚房', bodyType: '苗条',
      hometown: '济南', likes: 47, hot: 512,
      desc: '我女儿，93年出生，166厘米，本科毕业，小学教师，性格温柔文静，喜欢阅读与烘焙，希望对方成熟稳重、有责任心。',
      wants: { year: '1988-1993', income: '10万以上', height: '172-185', house: '有婚房', edu: '本科', marriage: '未婚', origin: '山东', location: '济南' },
      avatar: '女3'
    },
    {
      id: '81937465',
      gender: '女', year: 1990, age: 36, height: 162,
      edu: '中专/高中', origin: '江苏徐州', location: '徐州云龙区',
      job: '银行职员', income: '10-15万', marriage: '未婚',
      hasHouse: '有婚房', bodyType: '适中',
      hometown: '徐州', likes: 33, hot: 412,
      desc: '我家闺女，90年，162，徐州本地人，银行工作稳定，人长得秀气，性格温婉，希望另一半成熟踏实，最好本地或周边。',
      wants: { year: '1985-1990', income: '15万以上', height: '170-183', house: '有婚房', edu: '本科', marriage: '未婚', origin: '江苏', location: '徐州' },
      avatar: '女4'
    }
  ],
  heightOptions: (() => {
    const out = [];
    for (let i = 140; i <= 199; i++) out.push(i);
    return out;
  })(),
  jobOptions: ['公务员','会计','国企员工','销售','事业单位','建筑工程师','教师','律师','医生','银行职员','护士','军人','软件开发工程师','厂里工作','个体经营者','设计师','金融从业者','自由职业者','厨师','在读学生','互联网职员','央企员工','司机','公共服务人员','其他'],
  regions: {
    '北京': ['东城区','西城区','朝阳区','丰台区','石景山区','海淀区','门头沟区','房山区','通州区','顺义区','昌平区','大兴区','怀柔区','平谷区','密云区','延庆区'],
    '山东': ['济南','青岛','德州','淄博','烟台','潍坊','临沂','威海'],
    '河北': ['石家庄','唐山','保定','邯郸','廊坊','沧州'],
    '天津': ['和平区','河东区','河西区','南开区','河北区','红桥区','滨海新区'],
    '江苏': ['南京','苏州','无锡','徐州','常州','南通'],
    '上海': ['黄浦区','徐汇区','长宁区','静安区','浦东新区','闵行区'],
  },
  eduOptions: ['不限','小学/初中','中专/高中','大专','本科','硕士','博士及以上'],
  incomeOptions: ['不限','3万以下','3-5万','5-7万','7-10万','10-15万','15-20万','20-30万','30-50万','50-100万','100万以上'],
  houseOptions: ['不限','有婚房','无婚房','有购房计划'],
  marriageOptions: ['不限','未婚','离异未育','离异已育'],
  // For quick-fill
  traits: ['孝顺','成熟','谦虚','幽默','热情','温文尔雅','踏实','细心','开朗','真诚','正直','顾家'],
  advantages: ['有上进心','有车','家教好','家乡有房','会做家务','不抽烟喝酒','收入稳定','身体健康','学历高','工作稳定'],
  requirements: ['本地优先','收入稳定','体贴','学历相符','门当户对','顾家','性格温和','身高相符','无不良嗜好','孝顺父母'],
};
