const candidates = [
  {
    id: '36830153',
    gender: '女',
    year: 1987,
    age: 39,
    height: 163,
    residence: '德州',
    hometown: '天津',
    education: '小学/初中',
    occupation: '国企员工',
    income: '3-5万',
    marriage: '离异已育',
    housing: '有婚房',
    body: '适中',
    intro: '我家女儿，出生于87年，身高163厘米，学历小学/初中，目前居住在德州，职业国企员工。性格温和，善解人意，喜欢安静的生活。',
    requirements: {
      yearRange: '1982年-1987年',
      income: '不限',
      height: '170cm-188cm',
      housing: '不限',
      education: '中专/高中及以上',
      marriage: '离异未育',
      hometown: '德州',
      residence: '德州',
    },
    likes: 0,
    hot: 116,
    posted: '3天前',
    tone: 'rose',
    initial: '晴',
  },
  {
    id: '31821616',
    gender: '女',
    year: 1991,
    age: 35,
    height: 160,
    residence: '德州德城区',
    hometown: '德州',
    education: '小学/初中',
    occupation: '销售',
    income: '5-7万',
    marriage: '未婚',
    housing: '无婚房',
    body: '苗条',
    intro: '我家女儿，出生于91年，身高160厘米，学历小学/初中，目前居住在德州德城区，职业销售。开朗外向，工作勤勉，喜欢旅行和读书。',
    requirements: {
      yearRange: '1988年-1993年',
      income: '10万以上',
      height: '172cm-185cm',
      housing: '有婚房',
      education: '大专及以上',
      marriage: '未婚',
      hometown: '不限',
      residence: '德州',
    },
    likes: 12,
    hot: 203,
    posted: '1天前',
    tone: 'sage',
    initial: '悦',
  },
  {
    id: '42917283',
    gender: '男',
    year: 1985,
    age: 41,
    height: 178,
    residence: '济南',
    hometown: '济南',
    education: '本科',
    occupation: '工程师',
    income: '15-20万',
    marriage: '未婚',
    housing: '有婚房',
    body: '匀称',
    intro: '本人出生于85年，身高178厘米，本科学历，目前在济南从事工程师工作。踏实可靠，生活规律，业余时间喜欢登山和摄影。',
    requirements: {
      yearRange: '1986年-1992年',
      income: '不限',
      height: '158cm-172cm',
      housing: '不限',
      education: '本科及以上',
      marriage: '未婚',
      hometown: '不限',
      residence: '济南',
    },
    likes: 45,
    hot: 418,
    posted: '今天',
    tone: 'ocean',
    initial: '致',
  },
  {
    id: '58392014',
    gender: '男',
    year: 1982,
    age: 44,
    height: 175,
    residence: '北京朝阳区',
    hometown: '保定',
    education: '硕士',
    occupation: '医生',
    income: '20万以上',
    marriage: '离异未育',
    housing: '有婚房',
    body: '适中',
    intro: '我儿子，出生于82年，身高175厘米，硕士学历，在北京朝阳区一家三甲医院工作。性格成熟稳重，对家庭观念重。',
    requirements: {
      yearRange: '1983年-1990年',
      income: '不限',
      height: '160cm-172cm',
      housing: '不限',
      education: '本科及以上',
      marriage: '未婚 / 离异未育',
      hometown: '不限',
      residence: '北京',
    },
    likes: 88,
    hot: 512,
    posted: '2天前',
    tone: 'indigo',
    initial: '朗',
  },
  {
    id: '23984105',
    gender: '女',
    year: 1993,
    age: 33,
    height: 165,
    residence: '上海浦东',
    hometown: '苏州',
    education: '本科',
    occupation: '设计师',
    income: '10-15万',
    marriage: '未婚',
    housing: '无婚房',
    body: '苗条',
    intro: '我家女儿，93年出生，身高165厘米，本科学历，目前在上海从事设计工作。性格温婉，爱好烘焙、旅行和瑜伽。',
    requirements: {
      yearRange: '1988年-1993年',
      income: '15万以上',
      height: '172cm-185cm',
      housing: '有婚房',
      education: '本科及以上',
      marriage: '未婚',
      hometown: '不限',
      residence: '上海',
    },
    likes: 134,
    hot: 672,
    posted: '今天',
    tone: 'plum',
    initial: '雅',
  },
];

const experiences = [
  {
    id: 'e1',
    title: '相亲第一面，聊什么最稳妥？',
    excerpt: '见面时不用急着聊房子车子，先从生活细节聊起。周末怎么过、家里常做什么菜，这些细节更能看出性格。',
    author: '老槐树下',
    tag: '经验',
    likes: 328,
    replies: 42,
  },
  {
    id: 'e2',
    title: '做父母的，给孩子相亲的三条原则',
    excerpt: '第一，尊重孩子的选择；第二，多看人品少看条件；第三，该放手时就放手。',
    author: '北京张阿姨',
    tag: '父母视角',
    likes: 512,
    replies: 89,
  },
  {
    id: 'e3',
    title: '异地恋能不能走到最后？',
    excerpt: '三年异地的我们，上周领了证。回头看，靠的不是技巧，是两个人都愿意为彼此调整节奏。',
    author: '阿琛',
    tag: '亲历',
    likes: 201,
    replies: 37,
  },
];

const messages = [
  { id: 'm1', name: '寻缘号 42917283', initial: '致', tone: 'ocean', preview: '您好，看了您家女儿的资料，觉得挺合适的', time: '刚刚', unread: 2 },
  { id: 'm2', name: '红娘 · 小李', initial: '李', tone: 'rose', preview: '为您推荐了 3 位新的对象，请查看', time: '2小时前', unread: 0, official: true },
  { id: 'm3', name: '寻缘号 58392014', initial: '朗', tone: 'indigo', preview: '谢谢您的联系，方便加个微信吗？', time: '昨天', unread: 0 },
  { id: 'm4', name: '系统通知', initial: '通', tone: 'ink', preview: '您的资料审核已通过', time: '3天前', unread: 0, official: true },
];

const cities = ['北京', '上海', '天津', '济南', '德州', '青岛', '苏州', '杭州', '成都', '西安', '广州', '深圳', '武汉', '长沙'];
const years = Array.from({ length: 24 }, (_, index) => `${1975 + index}`);
const educationLabels = ['小学/初中', '中专/高中', '大专', '本科', '硕士', '博士'];
const filterCityLabels = cities.slice(0, 10);
const incomeOptions = ['3-5万', '5-7万', '7-10万', '10-15万', '15-20万', '20万以上'];
const marriageOptions = ['未婚', '离异未育', '离异已育', '其他'];
const housingOptions = ['有婚房', '无婚房', '可商量', '不限'];

const createOptionList = (labels, selectedLabels) => labels.map((label) => ({
  label,
  selected: selectedLabels.includes(label),
}));

const createPhotos = () => [
  { id: 'photo-1', filled: false },
  { id: 'photo-2', filled: false },
  { id: 'photo-3', filled: false },
];

const calcProgress = (form, photos) => {
  const filled = [
    form.nickname,
    form.income,
    form.marriage,
    form.housing,
    form.intro && form.intro.trim(),
    photos[0].filled,
    photos[1].filled,
    photos[2].filled,
  ].filter(Boolean).length;

  return Math.round((filled / 8) * 100);
};

Page({
  data: {
    screen: 'home',
    activeTab: 'home',
    filterState: {
      gender: '男',
      city: '北京',
      year: '1987',
    },
    cityOpen: false,
    yearOpen: false,
    cities,
    years,
    candidates,
    experiences,
    messages,
    selectedCandidate: candidates[0],
    selectedMessage: null,
    chatThread: [],
    chatInput: '',
    bannerDismissed: false,
    detailStarred: false,
    detailUnlocked: false,
    detailToast: true,
    contactOpen: false,
    shareTabs: ['精选', '热门', '父母视角', '亲历', '问答'],
    currentShareTab: '精选',
    filterGender: '男',
    ageMin: 25,
    ageMax: 40,
    heightMin: 160,
    heightMax: 185,
    educationOptions: createOptionList(educationLabels, ['本科']),
    filterMarriage: '未婚',
    filterHousing: '不限',
    filterCities: createOptionList(filterCityLabels, ['北京']),
    filterCityCount: 1,
    matchCount: 128,
    incomeOptions,
    marriageOptions,
    housingOptions,
    form: {
      nickname: '寻缘号 53366922',
      income: '5-7万',
      marriage: '其他',
      housing: '无婚房',
      intro: '',
    },
    photos: createPhotos(),
    formProgress: 50,
    formReturnScreen: 'list',
    stats: [
      { label: '我的收藏', value: 12 },
      { label: '我解锁的', value: 3 },
      { label: '查看我的', value: 47 },
      { label: '等待回复', value: 5 },
    ],
    memberActions: [
      { label: '我的资料', icon: '资' },
      { label: '会员中心', icon: '会' },
      { label: '实名认证', icon: '认' },
      { label: '帮助反馈', icon: '助' },
      { label: '设置', icon: '设' },
    ],
  },

  noop() {},

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    const screenMap = {
      home: 'home',
      list: 'list',
      share: 'share',
      msg: 'msg',
      me: 'me',
    };

    this.setData({
      activeTab: tab,
      screen: screenMap[tab],
      selectedMessage: null,
      contactOpen: false,
      cityOpen: false,
      yearOpen: false,
    });
  },

  selectHomeGender(e) {
    this.setData({
      'filterState.gender': e.currentTarget.dataset.value,
    });
  },

  toggleCityPanel() {
    this.setData({
      cityOpen: !this.data.cityOpen,
      yearOpen: false,
    });
  },

  toggleYearPanel() {
    this.setData({
      yearOpen: !this.data.yearOpen,
      cityOpen: false,
    });
  },

  selectCity(e) {
    this.setData({
      'filterState.city': e.currentTarget.dataset.value,
      cityOpen: false,
    });
  },

  selectYear(e) {
    this.setData({
      'filterState.year': e.currentTarget.dataset.value,
      yearOpen: false,
    });
  },

  startSearch() {
    this.setData({
      screen: 'list',
      activeTab: 'list',
      cityOpen: false,
      yearOpen: false,
    });
  },

  openFilter() {
    this.setData({
      screen: 'filter',
      contactOpen: false,
    });
  },

  closeFilter() {
    this.setData({
      screen: 'list',
      activeTab: 'list',
    });
  },

  resetFilter() {
    this.setData({
      filterGender: '男',
      ageMin: 25,
      ageMax: 40,
      heightMin: 160,
      heightMax: 185,
      educationOptions: createOptionList(educationLabels, ['本科']),
      filterMarriage: '未婚',
      filterHousing: '不限',
      filterCities: createOptionList(filterCityLabels, ['北京']),
      filterCityCount: 1,
      matchCount: 128,
    });
  },

  applyFilter() {
    wx.showToast({
      title: '已应用筛选',
      icon: 'success',
    });
    this.closeFilter();
  },

  selectFilterGender(e) {
    this.setData({
      filterGender: e.currentTarget.dataset.value,
    });
  },

  onAgeMinChange(e) {
    const next = Number(e.detail.value);
    this.setData({
      ageMin: Math.min(next, this.data.ageMax - 1),
    });
  },

  onAgeMaxChange(e) {
    const next = Number(e.detail.value);
    this.setData({
      ageMax: Math.max(next, this.data.ageMin + 1),
    });
  },

  onHeightMinChange(e) {
    const next = Number(e.detail.value);
    this.setData({
      heightMin: Math.min(next, this.data.heightMax - 1),
    });
  },

  onHeightMaxChange(e) {
    const next = Number(e.detail.value);
    this.setData({
      heightMax: Math.max(next, this.data.heightMin + 1),
    });
  },

  toggleEducation(e) {
    const index = e.currentTarget.dataset.index;
    const educationOptions = this.data.educationOptions.map((item, itemIndex) => ({
      ...item,
      selected: itemIndex === index ? !item.selected : item.selected,
    }));

    this.setData({ educationOptions });
  },

  selectFilterMarriage(e) {
    this.setData({
      filterMarriage: e.currentTarget.dataset.value,
    });
  },

  selectFilterHousing(e) {
    this.setData({
      filterHousing: e.currentTarget.dataset.value,
    });
  },

  toggleFilterCity(e) {
    const index = e.currentTarget.dataset.index;
    const filterCities = this.data.filterCities.map((item, itemIndex) => ({
      ...item,
      selected: itemIndex === index ? !item.selected : item.selected,
    }));
    const filterCityCount = filterCities.filter((item) => item.selected).length;

    this.setData({
      filterCities,
      filterCityCount,
      matchCount: Math.max(18, 138 - filterCityCount * 10),
    });
  },

  openDetail(e) {
    const candidate = candidates.find((item) => item.id === e.currentTarget.dataset.id) || candidates[0];

    this.setData({
      screen: 'detail',
      selectedCandidate: candidate,
      detailStarred: false,
      detailUnlocked: false,
      detailToast: true,
      contactOpen: false,
      activeTab: 'list',
    });
  },

  backToList() {
    this.setData({
      screen: 'list',
      activeTab: 'list',
      contactOpen: false,
    });
  },

  goHome() {
    this.setData({
      screen: 'home',
      activeTab: 'home',
      contactOpen: false,
    });
  },

  toggleStar() {
    this.setData({
      detailStarred: !this.data.detailStarred,
    });
  },

  unlockDetail() {
    this.setData({
      detailUnlocked: true,
    });
    wx.showToast({
      title: '已解锁',
      icon: 'success',
    });
  },

  openContact() {
    this.setData({
      contactOpen: true,
    });
  },

  closeContact() {
    this.setData({
      contactOpen: false,
    });
  },

  confirmContact() {
    this.setData({
      contactOpen: false,
      detailUnlocked: true,
    });
    wx.showToast({
      title: '联系方式已解锁',
      icon: 'success',
    });
  },

  hideDetailToast() {
    this.setData({
      detailToast: false,
    });
  },

  contactCandidate() {
    wx.showToast({
      title: '已发送联系意向',
      icon: 'success',
    });
  },

  dismissBanner() {
    this.setData({
      bannerDismissed: true,
    });
  },

  openForm(e) {
    const fallback = this.data.screen === 'me' ? 'me' : 'list';
    const returnScreen = e && e.currentTarget.dataset.return ? e.currentTarget.dataset.return : fallback;

    this.setData({
      screen: 'form',
      formReturnScreen: returnScreen,
      contactOpen: false,
    });
  },

  saveForm() {
    wx.showToast({
      title: '资料已保存',
      icon: 'success',
    });
    this.setData({
      screen: this.data.formReturnScreen,
      activeTab: this.data.formReturnScreen === 'me' ? 'me' : 'list',
    });
  },

  closeForm() {
    this.setData({
      screen: this.data.formReturnScreen,
      activeTab: this.data.formReturnScreen === 'me' ? 'me' : 'list',
    });
  },

  onIncomeChange(e) {
    const form = {
      ...this.data.form,
      income: incomeOptions[e.detail.value],
    };

    this.setData({
      form,
      formProgress: calcProgress(form, this.data.photos),
    });
  },

  onMarriageChange(e) {
    const form = {
      ...this.data.form,
      marriage: marriageOptions[e.detail.value],
    };

    this.setData({
      form,
      formProgress: calcProgress(form, this.data.photos),
    });
  },

  onHousingChange(e) {
    const form = {
      ...this.data.form,
      housing: housingOptions[e.detail.value],
    };

    this.setData({
      form,
      formProgress: calcProgress(form, this.data.photos),
    });
  },

  onIntroInput(e) {
    const form = {
      ...this.data.form,
      intro: e.detail.value,
    };

    this.setData({
      form,
      formProgress: calcProgress(form, this.data.photos),
    });
  },

  togglePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const photos = this.data.photos.map((photo, itemIndex) => ({
      id: photo.id,
      filled: itemIndex === index ? !photo.filled : photo.filled,
    }));

    this.setData({
      photos,
      formProgress: calcProgress(this.data.form, photos),
    });
  },

  switchShareTab(e) {
    this.setData({
      currentShareTab: e.currentTarget.dataset.value,
    });
  },

  openChat(e) {
    const message = this.data.messages.find((item) => item.id === e.currentTarget.dataset.id) || this.data.messages[0];
    const messagesNext = this.data.messages.map((item) => ({
      ...item,
      unread: item.id === message.id ? 0 : item.unread,
    }));

    this.setData({
      screen: 'chat',
      activeTab: 'msg',
      selectedMessage: message,
      messages: messagesNext,
      chatThread: [
        { id: 'chat-1', who: 'them', text: message.preview, time: message.time, initial: message.initial, tone: message.tone },
        { id: 'chat-2', who: 'me', text: '您好，谢谢您的关注！', time: '刚刚', initial: '我', tone: 'ink' },
        { id: 'chat-3', who: 'them', text: '方便的话我们加个微信？我是孩子的父亲。', time: '刚刚', initial: message.initial, tone: message.tone },
      ],
      chatInput: '',
    });
  },

  backMessages() {
    this.setData({
      screen: 'msg',
      activeTab: 'msg',
      selectedMessage: null,
    });
  },

  onChatInput(e) {
    this.setData({
      chatInput: e.detail.value,
    });
  },

  sendChat() {
    const text = this.data.chatInput.trim();
    if (!text) {
      return;
    }

    this.setData({
      chatThread: this.data.chatThread.concat([{
        id: `chat-${Date.now()}`,
        who: 'me',
        text,
        time: '刚刚',
        initial: '我',
        tone: 'ink',
      }]),
      chatInput: '',
    });
  },

  tapMemberAction(e) {
    const label = e.currentTarget.dataset.label;
    if (label === '我的资料') {
      this.openForm({ currentTarget: { dataset: { return: 'me' } } });
      return;
    }

    wx.showToast({
      title: '功能演示',
      icon: 'none',
    });
  },
});
