'use strict';

function src(label, url) {
  return { label, url };
}

function moexIssue(ticker) {
  return src('Мосбиржа — карточка ' + ticker, 'https://www.moex.com/ru/issue.aspx?code=' + ticker);
}

function moexIndex(id, title) {
  return src('Мосбиржа — ' + title, 'https://iss.moex.com/iss/statistics/engines/stock/markets/index/analytics/' + id + '.json');
}

export const CANONICAL_SECTORS = [
  'Финансы',
  'Энергетика',
  'Материалы',
  'Потребительский сектор',
  'Информационные технологии',
  'Коммуникационные услуги',
  'Промышленность',
  'Недвижимость',
  'Здравоохранение'
];

export const INDEX_SECTOR = {
  MOEXFN: 'Финансы',
  MOEXOG: 'Энергетика',
  MOEXEU: 'Энергетика',
  MOEXCH: 'Материалы',
  MOEXMM: 'Материалы',
  MOEXTL: 'Коммуникационные услуги',
  MOEXTN: 'Промышленность',
  MOEXRE: 'Недвижимость'
};

export const INDEX_TITLES = {
  MOEXFN: 'Индекс МосБиржи финансов',
  MOEXOG: 'Индекс МосБиржи нефти и газа',
  MOEXEU: 'Индекс МосБиржи электроэнергетики',
  MOEXCH: 'Индекс МосБиржи химии и нефтехимии',
  MOEXMM: 'Индекс МосБиржи металлов и добычи',
  MOEXTL: 'Индекс МосБиржи телекоммуникаций',
  MOEXIT: 'Индекс МосБиржи ИТ и телеком',
  MOEXCN: 'Индекс МосБиржи потребительского сектора',
  MOEXTN: 'Индекс МосБиржи транспорта',
  MOEXRE: 'Индекс МосБиржи недвижимости'
};

/**
 * Explicit research classification by any ticker of the company.
 * Takes priority over profiles and index inference.
 * sector=null + review=true means the 9 canonical sectors are not sufficient.
 */
export const BY_TICKER = {};

function add(tickers, spec) {
  const row = { ...spec, sources: spec.sources || [] };
  for (const t of tickers) BY_TICKER[t] = row;
}

add(['AFKS'], {
  companyId: 'sistema',
  sector: null,
  industry: null,
  review: true,
  reviewReason: 'Диверсифицированный холдинг (телеком, ритейл, лес, агро, медицина, недвижимость). Одной канонической отрасли нет.',
  proposedSector: 'Холдинги и конгломераты',
  sources: [
    moexIssue('AFKS'),
    src('АФК «Система» — о компании', 'https://sistema.ru/about'),
    src('Мосбиржа — IMOEX constituent AFKS', 'https://iss.moex.com/iss/statistics/engines/stock/markets/index/analytics/IMOEX.json')
  ]
});

add(['SBER', 'SBERP'], {
  companyId: 'sber',
  sector: 'Финансы',
  industry: 'Банки',
  origin: 'company-profiles',
  sources: [src('СберБанк — о компании', 'https://www.sberbank.com/ru/about'), moexIssue('SBER')]
});
add(['VTBR'], {
  companyId: 'vtb',
  sector: 'Финансы',
  industry: 'Банки',
  origin: 'company-profiles',
  sources: [src('Банк России — Банк ВТБ (ПАО)', 'https://www.cbr.ru/finorg/foinfo/?ogrn=1027739609391'), moexIssue('VTBR')]
});
add(['T', 'TCSG'], {
  companyId: 't-technologies',
  sector: 'Финансы',
  industry: 'Банки',
  origin: 'company-profiles',
  sources: [src('Т-Технологии — годовой отчёт', 'https://t-technologies.ru/ar2025t-technologies/index.html'), moexIssue('T')]
});
add(['SVCB'], {
  companyId: 'sovcombank',
  sector: 'Финансы',
  industry: 'Банки',
  origin: 'company-profiles',
  sources: [moexIssue('SVCB')]
});
add(['MOEX'], {
  companyId: 'moex',
  sector: 'Финансы',
  industry: 'Биржи и рыночная инфраструктура',
  origin: 'company-profiles',
  sources: [src('Банк России — ПАО Московская Биржа', 'https://www.cbr.ru/finorg/foinfo/?ogrn=1027739387411'), moexIssue('MOEX')]
});
add(['GAZP'], {
  companyId: 'gazprom',
  sector: 'Энергетика',
  industry: 'Газ',
  origin: 'company-profiles',
  sources: [moexIssue('GAZP')]
});
add(['NVTK'], {
  companyId: 'novatek',
  sector: 'Энергетика',
  industry: 'Газ',
  origin: 'company-profiles',
  sources: [moexIssue('NVTK')]
});
add(['LKOH'], {
  companyId: 'lukoil',
  sector: 'Энергетика',
  industry: 'Нефть и газ',
  origin: 'company-profiles',
  sources: [src('ЛУКОЙЛ — акционерный капитал', 'https://lukoil.ru/InvestorAndShareholderCenter/Securities/sharecapital')]
});
add(['ROSN'], {
  companyId: 'rosneft',
  sector: 'Энергетика',
  industry: 'Нефть и газ',
  origin: 'company-profiles',
  sources: [moexIssue('ROSN')]
});
add(['TATN', 'TATNP'], {
  companyId: 'tatneft',
  sector: 'Энергетика',
  industry: 'Нефть и газ',
  origin: 'company-profiles',
  sources: [moexIssue('TATN')]
});
add(['SNGS', 'SNGSP'], {
  companyId: 'surgutneftegas',
  sector: 'Энергетика',
  industry: 'Нефть и газ',
  origin: 'company-profiles',
  sources: [moexIssue('SNGS')]
});
add(['SIBN'], {
  companyId: 'gazprom-neft',
  sector: 'Энергетика',
  industry: 'Нефть и газ',
  origin: 'company-profiles',
  sources: [src('Мосбиржа — карточка эмитента', 'https://www.moex.com/ru/listing/securities-cards.aspx?code=RU0009062467')]
});
add(['GMKN'], {
  companyId: 'nornickel',
  sector: 'Материалы',
  industry: 'Цветные металлы',
  origin: 'company-profiles',
  sources: [src('Норникель — акционерный капитал', 'https://ar2025.nornickel.ru/shareholders/share-capital/')]
});
add(['NLMK'], {
  companyId: 'nlmk',
  sector: 'Материалы',
  industry: 'Чёрная металлургия',
  origin: 'company-profiles',
  sources: [moexIssue('NLMK')]
});
add(['CHMF'], {
  companyId: 'severstal',
  sector: 'Материалы',
  industry: 'Чёрная металлургия',
  origin: 'company-profiles',
  sources: [moexIssue('CHMF')]
});
add(['PLZL'], {
  companyId: 'polyus',
  sector: 'Материалы',
  industry: 'Добыча золота',
  origin: 'company-profiles',
  sources: [moexIssue('PLZL')]
});
add(['ALRS'], {
  companyId: 'alrosa',
  sector: 'Материалы',
  industry: 'Добыча алмазов',
  origin: 'company-profiles',
  sources: [moexIssue('ALRS')]
});
add(['MGNT'], {
  companyId: 'magnit',
  sector: 'Потребительский сектор',
  industry: 'Розничная торговля',
  origin: 'company-profiles',
  sources: [src('Магнит — акции', 'https://www.magnit.com/ru/shareholders-and-investors/shares-and-gdrs/')]
});
add(['OZON'], {
  companyId: 'ozon',
  sector: 'Потребительский сектор',
  industry: 'Интернет-торговля',
  origin: 'company-profiles',
  sources: [moexIssue('OZON'), moexIndex('MOEXIT', INDEX_TITLES.MOEXIT)]
});
add(['YDEX'], {
  companyId: 'yandex',
  sector: 'Информационные технологии',
  industry: 'Интернет-сервисы',
  origin: 'company-profiles',
  sources: [src('Яндекс — IR', 'https://ir.yandex.ru/')]
});
add(['MTSS'], {
  companyId: 'mts',
  sector: 'Коммуникационные услуги',
  industry: 'Сотовая связь',
  origin: 'company-profiles',
  sources: [src('МТС — капитал и ценные бумаги', 'https://ar2025.mts.ru/korporativnoe-upravlenie/kapital-i-czennye-bumagi/')]
});
add(['VKCO'], {
  companyId: 'vk',
  sector: 'Коммуникационные услуги',
  industry: 'Интернет и медиа',
  origin: 'company-profiles',
  sources: [moexIssue('VKCO')]
});
add(['AFLT'], {
  companyId: 'aeroflot',
  sector: 'Промышленность',
  industry: 'Авиаперевозки',
  origin: 'company-profiles',
  sources: [moexIssue('AFLT')]
});
add(['SMLT'], {
  companyId: 'samolet',
  sector: 'Недвижимость',
  industry: 'Девелопмент',
  origin: 'company-profiles',
  sources: [moexIssue('SMLT')]
});
add(['OZPH'], {
  companyId: 'ozon-pharm',
  sector: 'Здравоохранение',
  industry: 'Фармацевтика',
  origin: 'company-profiles',
  sources: [
    src('Озон Фармацевтика — акционерный капитал', 'https://ozonpharm.ru/investors/shareholders/share-capital/'),
    moexIndex('MOEXCN', INDEX_TITLES.MOEXCN)
  ]
});

add(['CBOM'], { companyId: 'mkb', sector: 'Финансы', industry: 'Банки', sources: [moexIssue('CBOM'), moexIndex('MOEXFN', INDEX_TITLES.MOEXFN)] });
add(['BSPB', 'BSPBP'], { companyId: 'bspb', sector: 'Финансы', industry: 'Банки', sources: [moexIssue('BSPB'), moexIndex('MOEXFN', INDEX_TITLES.MOEXFN)] });
add(['MBNK'], { companyId: 'mts-bank', sector: 'Финансы', industry: 'Банки', sources: [moexIssue('MBNK'), moexIndex('MOEXFN', INDEX_TITLES.MOEXFN)] });
add(['DOMRF'], { companyId: 'dom-rf', sector: 'Финансы', industry: 'Институты развития', sources: [moexIssue('DOMRF'), moexIndex('MOEXFN', INDEX_TITLES.MOEXFN), src('ДОМ.РФ — о компании', 'https://дом.рф/about/')] });
add(['RENI'], { companyId: 'renaissance-insurance', sector: 'Финансы', industry: 'Страхование', sources: [moexIssue('RENI'), moexIndex('MOEXFN', INDEX_TITLES.MOEXFN)] });
add(['SFIN'], { companyId: 'sfi', sector: 'Финансы', industry: 'Лизинг', sources: [moexIssue('SFIN'), moexIndex('MOEXFN', INDEX_TITLES.MOEXFN)] });
add(['SPBE'], { companyId: 'spb-exchange', sector: 'Финансы', industry: 'Биржи и рыночная инфраструктура', sources: [moexIssue('SPBE'), moexIndex('MOEXFN', INDEX_TITLES.MOEXFN)] });
add(['LEAS'], { companyId: 'europlan', sector: 'Финансы', industry: 'Лизинг', sources: [moexIssue('LEAS'), src('Европлан — о компании', 'https://www.europlan.ru/')] });
add(['RGSS'], { companyId: 'rosgosstrakh', sector: 'Финансы', industry: 'Страхование', sources: [moexIssue('RGSS'), src('Росгосстрах — о компании', 'https://www.rgs.ru/')] });
add(['AVAN'], { companyId: 'avangard-bank', sector: 'Финансы', industry: 'Банки', sources: [moexIssue('AVAN')] });
add(['USBN'], { companyId: 'uralsib', sector: 'Финансы', industry: 'Банки', sources: [moexIssue('USBN')] });
add(['PRMB'], { companyId: 'primorye-bank', sector: 'Финансы', industry: 'Банки', sources: [moexIssue('PRMB')] });
add(['RDRB'], { companyId: 'dorbank', sector: 'Финансы', industry: 'Банки', sources: [moexIssue('RDRB')] });
add(['KUZB'], { companyId: 'kuznetsky-bank', sector: 'Финансы', industry: 'Банки', sources: [moexIssue('KUZB')] });
add(['ZAYM'], { companyId: 'zaymer', sector: 'Финансы', industry: 'Микрофинансирование', sources: [moexIssue('ZAYM')] });
add(['RUSI'], { companyId: 'russ-invest', sector: 'Финансы', industry: 'Инвестиционные компании', sources: [moexIssue('RUSI')] });
add(['ARSA'], { companyId: 'arsagera', sector: 'Финансы', industry: 'Инвестиционные компании', sources: [moexIssue('ARSA')] });
add(['GAZT'], { companyId: 'gaz-tek', sector: 'Финансы', industry: 'Инвестиционные холдинги', sources: [src('ГАЗ-Тек — о компании', 'https://www.gaz-tek.ru/'), src('Эксперт РА — рейтинг ГАЗ-Тек', 'https://raexpert.ru/releases/2026/feb03e'), moexIssue('GAZT')] });
add(['GAZS'], { companyId: 'gaz-service', sector: 'Финансы', industry: 'Инвестиционные холдинги', sources: [moexIssue('GAZS')] });
add(['GAZC'], { companyId: 'gazkon', sector: 'Финансы', industry: 'Инвестиционные холдинги', sources: [moexIssue('GAZC')] });
add(['MGKL'], { companyId: 'mosgorlombard', sector: 'Финансы', industry: 'Микрофинансирование', sources: [moexIssue('MGKL')] });

add(['PHOR'], { companyId: 'phosagro', sector: 'Материалы', industry: 'Удобрения', sources: [moexIssue('PHOR'), moexIndex('MOEXCH', INDEX_TITLES.MOEXCH)] });
add(['AKRN'], { companyId: 'acron', sector: 'Материалы', industry: 'Удобрения', sources: [moexIssue('AKRN'), moexIndex('MOEXCH', INDEX_TITLES.MOEXCH)] });
add(['MAGN'], { companyId: 'mmk', sector: 'Материалы', industry: 'Чёрная металлургия', sources: [moexIssue('MAGN'), moexIndex('MOEXMM', INDEX_TITLES.MOEXMM)] });
add(['RUAL'], { companyId: 'rusal', sector: 'Материалы', industry: 'Цветные металлы', sources: [moexIssue('RUAL'), moexIndex('MOEXMM', INDEX_TITLES.MOEXMM)] });
add(['VSMO'], { companyId: 'vsmpo-avisma', sector: 'Материалы', industry: 'Цветные металлы', sources: [moexIssue('VSMO'), moexIndex('MOEXMM', INDEX_TITLES.MOEXMM)] });
add(['ENPG'], { companyId: 'en-plus', sector: 'Материалы', industry: 'Цветные металлы', sources: [moexIssue('ENPG'), moexIndex('MOEXMM', INDEX_TITLES.MOEXMM)] });
add(['UGLD'], { companyId: 'ugold', sector: 'Материалы', industry: 'Добыча золота', sources: [moexIssue('UGLD'), moexIndex('MOEXMM', INDEX_TITLES.MOEXMM)] });
add(['SELG'], { companyId: 'seligdar', sector: 'Материалы', industry: 'Добыча золота', sources: [moexIssue('SELG'), moexIndex('MOEXMM', INDEX_TITLES.MOEXMM)] });
add(['RASP'], { companyId: 'raspadskaya', sector: 'Материалы', industry: 'Добыча угля', sources: [moexIssue('RASP'), moexIndex('MOEXMM', INDEX_TITLES.MOEXMM)] });
add(['TRMK'], { companyId: 'tmk', sector: 'Материалы', industry: 'Чёрная металлургия', sources: [moexIssue('TRMK'), moexIndex('MOEXMM', INDEX_TITLES.MOEXMM)] });
add(['MTLR', 'MTLRP'], { companyId: 'mechel', sector: 'Материалы', industry: 'Чёрная металлургия', sources: [moexIssue('MTLR'), moexIndex('MOEXMM', INDEX_TITLES.MOEXMM)] });
add(['EVRZ'], { companyId: 'evraz', sector: 'Материалы', industry: 'Чёрная металлургия', sources: [moexIssue('EVRZ'), src('EVRAZ — о компании', 'https://www.evraz.com/ru/')] });
add(['SGZH'], { companyId: 'segezha', sector: 'Материалы', industry: 'Лесная промышленность', sources: [moexIssue('SGZH')] });
add(['KZOS', 'KZOSP'], { companyId: 'kazanorgsintez', sector: 'Материалы', industry: 'Химия и нефтехимия', sources: [moexIssue('KZOS')] });
add(['NKNC', 'NKNCP'], { companyId: 'nizhnekamskneftekhim', sector: 'Материалы', industry: 'Химия и нефтехимия', sources: [moexIssue('NKNC'), moexIndex('MOEXCH', INDEX_TITLES.MOEXCH)] });
add(['KAZT', 'KAZTP'], { companyId: 'kuibyshevazot', sector: 'Материалы', industry: 'Химия и нефтехимия', sources: [moexIssue('KAZT')] });
add(['HIMC', 'HIMCP'], { companyId: 'khimprom', sector: 'Материалы', industry: 'Химия и нефтехимия', sources: [moexIssue('HIMCP')] });
add(['VLHZ'], { companyId: 'vladimir-chemical', sector: 'Материалы', industry: 'Химия и нефтехимия', sources: [moexIssue('VLHZ')] });
add(['ROLO'], { companyId: 'rusolovo', sector: 'Материалы', industry: 'Цветные металлы', sources: [moexIssue('ROLO')] });
add(['BRZL'], { companyId: 'buryatzoloto', sector: 'Материалы', industry: 'Добыча золота', sources: [moexIssue('BRZL')] });
add(['CHMK'], { companyId: 'chemk', sector: 'Материалы', industry: 'Чёрная металлургия', sources: [moexIssue('CHMK')] });
add(['UKUZ'], { companyId: 'yuzhny-kuzbass', sector: 'Материалы', industry: 'Добыча угля', sources: [moexIssue('UKUZ')] });
add(['BLNG'], { companyId: 'belon', sector: 'Материалы', industry: 'Добыча угля', sources: [moexIssue('BLNG')] });
add(['KOGK'], { companyId: 'korshunovsky-gok', sector: 'Материалы', industry: 'Чёрная металлургия', sources: [moexIssue('KOGK')] });
add(['URKZ'], { companyId: 'uralskaya-kuznitsa', sector: 'Материалы', industry: 'Чёрная металлургия', sources: [moexIssue('URKZ')] });
add(['IGST', 'IGSTP'], { companyId: 'izhstal', sector: 'Материалы', industry: 'Чёрная металлургия', sources: [moexIssue('IGST')] });
add(['UNKL'], { companyId: 'yuzhuralnickel', sector: 'Материалы', industry: 'Цветные металлы', sources: [moexIssue('UNKL')] });
add(['MGNZ'], { companyId: 'solikamsk-magnesium', sector: 'Материалы', industry: 'Цветные металлы', sources: [moexIssue('MGNZ')] });
add(['NKSH'], { companyId: 'nizhnekamskshina', sector: 'Материалы', industry: 'Химия и нефтехимия', sources: [moexIssue('NKSH')] });

add(['IRAO'], { companyId: 'inter-rao', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('IRAO'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['HYDR'], { companyId: 'rushydro', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('HYDR'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['FEES'], { companyId: 'rosseti', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('FEES'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['UPRO'], { companyId: 'unipro', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('UPRO'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['MSNG'], { companyId: 'mosenergo', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MSNG'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['MSRS'], { companyId: 'rosseti-moscow', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MSRS'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['OGKB'], { companyId: 'ogk-2', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('OGKB'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['ELFV'], { companyId: 'el5-energo', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('ELFV'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['TGKA'], { companyId: 'tgc-1', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('TGKA'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['LSNG', 'LSNGP'], { companyId: 'lenenergo', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('LSNG'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['MRKC'], { companyId: 'rosseti-center', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MRKC'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['MRKP'], { companyId: 'rosseti-center-volga', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MRKP'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['MRKU'], { companyId: 'rosseti-ural', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MRKU'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['MRKV'], { companyId: 'rosseti-volga', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MRKV'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['MRKZ'], { companyId: 'rosseti-northwest', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MRKZ'), moexIndex('MOEXEU', INDEX_TITLES.MOEXEU)] });
add(['MRKY'], { companyId: 'rosseti-south', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MRKY')] });
add(['MRKS'], { companyId: 'rosseti-siberia', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MRKS')] });
add(['MRKK'], { companyId: 'rosseti-north-caucasus', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MRKK')] });
add(['TORS', 'TORSP'], { companyId: 'rosseti-tomsk', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('TORS')] });
add(['DVEC'], { companyId: 'dvec', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('DVEC')] });
add(['TNSE'], { companyId: 'tns-energo', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('TNSE')] });
add(['RTSB', 'RTSBP'], { companyId: 'tns-energo-rostov', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('RTSB')] });
add(['KBSB'], { companyId: 'tns-energo-kuban', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('KBSB')] });
add(['VRSB', 'VRSBP'], { companyId: 'tns-energo-voronezh', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('VRSB')] });
add(['YRSB', 'YRSBP'], { companyId: 'tns-energo-yaroslavl', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('YRSB')] });
add(['NNSB', 'NNSBP'], { companyId: 'tns-energo-nn', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('NNSB')] });
add(['MISB', 'MISBP'], { companyId: 'tns-energo-mariel', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MISB')] });
add(['KCHE', 'KCHEP'], { companyId: 'kamchatskenergo', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('KCHE')] });
add(['SAGO', 'SAGOP'], { companyId: 'samaraenergo', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('SAGO')] });
add(['SLEN'], { companyId: 'sakhalinenergo', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('SLEN')] });
add(['TGKB', 'TGKBP'], { companyId: 'tgc-2', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('TGKB')] });
add(['TGKN'], { companyId: 'tgc-14', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('TGKN')] });
add(['RZSB'], { companyId: 'ryazan-energosbyt', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('RZSB')] });
add(['LPSB'], { companyId: 'lipetsk-energosbyt', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('LPSB')] });
add(['VGSB', 'VGSBP'], { companyId: 'volgogradenergosbyt', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('VGSB')] });
add(['KGKC', 'KGKCP'], { companyId: 'kurgan-generating', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('KGKC')] });
add(['SARE', 'SAREP'], { companyId: 'saratovenergo', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('SARE')] });
add(['YKEN', 'YKENP'], { companyId: 'yakutskenergo', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('YKEN')] });
add(['STSB', 'STSBP'], { companyId: 'unified-supplier', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('STSB')] });
add(['TASB', 'TASBP'], { companyId: 'tambov-energosbyt', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('TASB')] });
add(['ASSB'], { companyId: 'astrakhan-energosbyt', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('ASSB')] });
add(['KLSB'], { companyId: 'kaluga-sbyt', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('KLSB')] });
add(['MAGE', 'MAGEP'], { companyId: 'magadanenergo', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MAGE')] });
add(['MRSB'], { companyId: 'mordovenergosbyt', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('MRSB')] });
add(['KRSB', 'KRSBP'], { companyId: 'krasnoyarskenergosbyt', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('KRSB')] });
add(['PMSB', 'PMSBP'], { companyId: 'perm-energosbyt', sector: 'Энергетика', industry: 'Электроэнергетика', sources: [moexIssue('PMSB')] });
add(['TRNFP'], { companyId: 'transneft', sector: 'Энергетика', industry: 'Нефть и газ', sources: [moexIssue('TRNFP'), moexIndex('MOEXOG', INDEX_TITLES.MOEXOG)] });
add(['BANE', 'BANEP'], { companyId: 'bashneft', sector: 'Энергетика', industry: 'Нефть и газ', sources: [moexIssue('BANE')] });
add(['RNFT'], { companyId: 'russneft', sector: 'Энергетика', industry: 'Нефть и газ', sources: [moexIssue('RNFT')] });
add(['VJGZ', 'VJGZP'], { companyId: 'varyeganneftegaz', sector: 'Энергетика', industry: 'Нефть и газ', sources: [moexIssue('VJGZ')] });
add(['MFGS', 'MFGSP'], { companyId: 'megionneftegaz', sector: 'Энергетика', industry: 'Нефть и газ', sources: [moexIssue('MFGS')] });
add(['JNOS', 'JNOSP'], { companyId: 'yaroslavnefteorgsintez', sector: 'Энергетика', industry: 'Нефтепереработка', sources: [moexIssue('JNOS')] });
add(['KRKN', 'KRKNP'], { companyId: 'saratov-refinery', sector: 'Энергетика', industry: 'Нефтепереработка', sources: [moexIssue('KRKN')] });
add(['CHGZ'], { companyId: 'rn-west-siberia', sector: 'Энергетика', industry: 'Нефть и газ', sources: [moexIssue('CHGZ')] });
add(['YAKG'], { companyId: 'yatec', sector: 'Энергетика', industry: 'Газ', sources: [moexIssue('YAKG')] });
add(['RTGZ'], { companyId: 'gazprom-gazoraspredelenie-rostov', sector: 'Энергетика', industry: 'Газ', sources: [moexIssue('RTGZ')] });
add(['EUTR'], {
  companyId: 'eurotrans',
  sector: 'Потребительский сектор',
  industry: 'Топливная розница',
  sources: [
    src('ЕвроТранс — о компании', 'https://www.evrotrans-ao.ru/o-kompanii/'),
    moexIssue('EUTR')
  ]
});

add(['X5'], { companyId: 'x5', sector: 'Потребительский сектор', industry: 'Розничная торговля', sources: [moexIssue('X5'), moexIndex('MOEXCN', INDEX_TITLES.MOEXCN)] });
add(['LENT'], { companyId: 'lenta', sector: 'Потребительский сектор', industry: 'Розничная торговля', sources: [moexIssue('LENT'), moexIndex('MOEXCN', INDEX_TITLES.MOEXCN)] });
add(['FIXR'], { companyId: 'fix-price', sector: 'Потребительский сектор', industry: 'Розничная торговля', sources: [moexIssue('FIXR'), moexIndex('MOEXCN', INDEX_TITLES.MOEXCN)] });
add(['VSEH'], { companyId: 'vseinstrumenti', sector: 'Потребительский сектор', industry: 'Розничная торговля', sources: [moexIssue('VSEH'), moexIndex('MOEXCN', INDEX_TITLES.MOEXCN)] });
add(['MVID'], { companyId: 'mvideo', sector: 'Потребительский сектор', industry: 'Розничная торговля', sources: [moexIssue('MVID')] });
add(['BELU'], { companyId: 'novabev', sector: 'Потребительский сектор', industry: 'Алкогольная продукция', sources: [moexIssue('BELU'), moexIndex('MOEXCN', INDEX_TITLES.MOEXCN)] });
add(['AQUA'], { companyId: 'inarctica', sector: 'Потребительский сектор', industry: 'Продукты питания', sources: [moexIssue('AQUA'), moexIndex('MOEXCN', INDEX_TITLES.MOEXCN)] });
add(['RAGR'], { companyId: 'rusagro', sector: 'Потребительский сектор', industry: 'Продукты питания', sources: [moexIssue('RAGR'), moexIndex('MOEXCN', INDEX_TITLES.MOEXCN)] });
add(['GCHE'], { companyId: 'cherkizovo', sector: 'Потребительский сектор', industry: 'Продукты питания', sources: [moexIssue('GCHE')] });
add(['ABRD'], { companyId: 'abrau-durso', sector: 'Потребительский сектор', industry: 'Алкогольная продукция', sources: [moexIssue('ABRD')] });
add(['KROT', 'KROTP'], { companyId: 'krasny-oktyabr', sector: 'Потребительский сектор', industry: 'Продукты питания', sources: [moexIssue('KROT')] });
add(['HNFG'], { companyId: 'henderson', sector: 'Потребительский сектор', industry: 'Одежда', sources: [moexIssue('HNFG')] });
add(['WUSH'], { companyId: 'whoosh', sector: 'Потребительский сектор', industry: 'Микромобильность', sources: [moexIssue('WUSH'), moexIndex('MOEXCN', INDEX_TITLES.MOEXCN)] });
add(['DELI'], { companyId: 'delimobil', sector: 'Потребительский сектор', industry: 'Каршеринг', sources: [moexIssue('DELI'), src('Делимобиль — о компании', 'https://delimobil.ru/')] });
add(['ROST'], { companyId: 'rosinter', sector: 'Потребительский сектор', industry: 'Рестораны', sources: [moexIssue('ROST')] });
add(['KLVZ'], { companyId: 'kristall', sector: 'Потребительский сектор', industry: 'Алкогольная продукция', sources: [moexIssue('KLVZ')] });
add(['SVET', 'SVETP'], { companyId: 'svetofor', sector: 'Потребительский сектор', industry: 'Розничная торговля', sources: [moexIssue('SVET')] });
add(['LMBZ'], { companyId: 'lambumiz', sector: 'Потребительский сектор', industry: 'Продукты питания', sources: [moexIssue('LMBZ')] });
add(['DIOD'], { companyId: 'diod', sector: 'Потребительский сектор', industry: 'Продукты питания', sources: [moexIssue('DIOD')] });
add(['CARM'], { companyId: 'smarttechgroup', sector: 'Потребительский сектор', industry: 'Каршеринг', sources: [moexIssue('CARM')] });

add(['HEAD'], { companyId: 'headhunter', sector: 'Информационные технологии', industry: 'Интернет-сервисы', sources: [moexIssue('HEAD'), moexIndex('MOEXIT', INDEX_TITLES.MOEXIT)] });
add(['POSI'], { companyId: 'positive-technologies', sector: 'Информационные технологии', industry: 'Кибербезопасность', sources: [moexIssue('POSI'), moexIndex('MOEXIT', INDEX_TITLES.MOEXIT)] });
add(['ASTR'], { companyId: 'astra', sector: 'Информационные технологии', industry: 'Программное обеспечение', sources: [moexIssue('ASTR'), moexIndex('MOEXIT', INDEX_TITLES.MOEXIT)] });
add(['DATA'], { companyId: 'arenadata', sector: 'Информационные технологии', industry: 'Программное обеспечение', sources: [moexIssue('DATA'), moexIndex('MOEXIT', INDEX_TITLES.MOEXIT)] });
add(['SOFL'], { companyId: 'softline', sector: 'Информационные технологии', industry: 'ИТ-сервисы', sources: [moexIssue('SOFL'), moexIndex('MOEXIT', INDEX_TITLES.MOEXIT)] });
add(['DIAS'], { companyId: 'diasoft', sector: 'Информационные технологии', industry: 'Программное обеспечение', sources: [moexIssue('DIAS'), moexIndex('MOEXIT', INDEX_TITLES.MOEXIT)] });
add(['BAZA'], { companyId: 'basis', sector: 'Информационные технологии', industry: 'Программное обеспечение', sources: [moexIssue('BAZA'), moexIndex('MOEXIT', INDEX_TITLES.MOEXIT)] });
add(['CNRU'], { companyId: 'cian', sector: 'Информационные технологии', industry: 'Интернет-сервисы', sources: [moexIssue('CNRU'), moexIndex('MOEXIT', INDEX_TITLES.MOEXIT)] });
add(['BTBR'], { companyId: 'b2b-rts', sector: 'Информационные технологии', industry: 'Электронные торговые площадки', sources: [src('В2В-РТС — о платформе', 'https://b2b-rts.ru/about/'), src('Мосбиржа — старт торгов BTBR', 'https://www.moex.com/n99404'), moexIndex('MOEXIT', INDEX_TITLES.MOEXIT)] });
add(['IVAT'], { companyId: 'iva', sector: 'Информационные технологии', industry: 'Программное обеспечение', sources: [src('IVA Technologies — о компании', 'https://iva.ru/ru/about/'), moexIssue('IVAT')] });
add(['ELMT'], { companyId: 'element', sector: 'Информационные технологии', industry: 'Микроэлектроника', sources: [moexIssue('ELMT')] });

add(['RTKM', 'RTKMP'], { companyId: 'rostelecom', sector: 'Коммуникационные услуги', industry: 'Фиксированная связь', sources: [moexIssue('RTKM'), moexIndex('MOEXTL', INDEX_TITLES.MOEXTL)] });
add(['MGTS', 'MGTSP'], { companyId: 'mgts', sector: 'Коммуникационные услуги', industry: 'Фиксированная связь', sources: [moexIssue('MGTS'), moexIndex('MOEXTL', INDEX_TITLES.MOEXTL)] });
add(['TTLK'], { companyId: 'tattelecom', sector: 'Коммуникационные услуги', industry: 'Фиксированная связь', sources: [moexIssue('TTLK')] });
add(['CNTL', 'CNTLP'], { companyId: 'central-telegraph', sector: 'Коммуникационные услуги', industry: 'Фиксированная связь', sources: [moexIssue('CNTL')] });
add(['BISVP'], { companyId: 'bashinformsvyaz', sector: 'Коммуникационные услуги', industry: 'Фиксированная связь', sources: [moexIssue('BISVP')] });
add(['NSVZ'], { companyId: 'nauka-svyaz', sector: 'Коммуникационные услуги', industry: 'Фиксированная связь', sources: [moexIssue('NSVZ')] });
add(['RBCM'], { companyId: 'rbk', sector: 'Коммуникационные услуги', industry: 'Интернет и медиа', sources: [moexIssue('RBCM')] });
add(['VEON-RX'], { companyId: 'veon', sector: 'Коммуникационные услуги', industry: 'Сотовая связь', sources: [moexIssue('VEON-RX'), src('VEON — about', 'https://www.veon.com/')] });

add(['FLOT'], { companyId: 'sovcomflot', sector: 'Промышленность', industry: 'Морские перевозки', sources: [moexIssue('FLOT'), moexIndex('MOEXTN', INDEX_TITLES.MOEXTN)] });
add(['FESH'], { companyId: 'fesco', sector: 'Промышленность', industry: 'Морские перевозки', sources: [moexIssue('FESH'), moexIndex('MOEXTN', INDEX_TITLES.MOEXTN)] });
add(['NMTP'], { companyId: 'nmtp', sector: 'Промышленность', industry: 'Порты', sources: [moexIssue('NMTP'), moexIndex('MOEXTN', INDEX_TITLES.MOEXTN)] });
add(['NKHP'], { companyId: 'nkhp', sector: 'Промышленность', industry: 'Порты', sources: [moexIssue('NKHP'), moexIndex('MOEXTN', INDEX_TITLES.MOEXTN)] });
add(['UTAR'], { companyId: 'utair', sector: 'Промышленность', industry: 'Авиаперевозки', sources: [moexIssue('UTAR')] });
add(['UNAC'], { companyId: 'uac', sector: 'Промышленность', industry: 'Авиастроение', sources: [moexIssue('UNAC')] });
add(['IRKT'], { companyId: 'yakovlev', sector: 'Промышленность', industry: 'Авиастроение', sources: [moexIssue('IRKT')] });
add(['UWGN'], { companyId: 'uvz-rail', sector: 'Промышленность', industry: 'Машиностроение', sources: [moexIssue('UWGN')] });
add(['KMAZ'], { companyId: 'kamaz', sector: 'Промышленность', industry: 'Автомобилестроение', sources: [moexIssue('KMAZ')] });
add(['SVAV'], { companyId: 'sollers', sector: 'Промышленность', industry: 'Автомобилестроение', sources: [moexIssue('SVAV')] });
add(['GAZA', 'GAZAP'], { companyId: 'gaz', sector: 'Промышленность', industry: 'Автомобилестроение', sources: [moexIssue('GAZA')] });
add(['PAZA'], { companyId: 'pavlovsky-bus', sector: 'Промышленность', industry: 'Автомобилестроение', sources: [moexIssue('PAZA')] });
add(['ZILL'], { companyId: 'zil', sector: 'Промышленность', industry: 'Автомобилестроение', sources: [moexIssue('ZILL')] });
add(['NFAZ'], { companyId: 'nefaz', sector: 'Промышленность', industry: 'Автомобилестроение', sources: [moexIssue('NFAZ')] });
add(['VSYD', 'VSYDP'], { companyId: 'vyborg-shipyard', sector: 'Промышленность', industry: 'Судостроение', sources: [moexIssue('VSYD')] });
add(['OMZZP'], { companyId: 'omz', sector: 'Промышленность', industry: 'Машиностроение', sources: [moexIssue('OMZZP')] });
add(['RKKE'], { companyId: 'rsc-energia', sector: 'Промышленность', industry: 'Авиакосмическая отрасль', sources: [moexIssue('RKKE')] });
add(['MSTT'], { companyId: 'mostotrest', sector: 'Промышленность', industry: 'Инфраструктурное строительство', sources: [moexIssue('MSTT')] });
add(['CHKZ'], { companyId: 'chkpz', sector: 'Промышленность', industry: 'Машиностроение', sources: [moexIssue('CHKZ')] });
add(['KMEZ'], { companyId: 'kovrov-mechanical', sector: 'Промышленность', industry: 'Машиностроение', sources: [moexIssue('KMEZ')] });
add(['ZVEZ'], { companyId: 'zvezda', sector: 'Промышленность', industry: 'Машиностроение', sources: [moexIssue('ZVEZ')] });
add(['KRKOP'], { companyId: 'krasny-kotelshchik', sector: 'Промышленность', industry: 'Машиностроение', sources: [moexIssue('KRKOP')] });
add(['TUZA'], { companyId: 'tuymazy-abz', sector: 'Промышленность', industry: 'Машиностроение', sources: [moexIssue('TUZA')] });
add(['EELT'], { companyId: 'european-electrotechnica', sector: 'Промышленность', industry: 'Электротехника', sources: [moexIssue('EELT')] });
add(['INCB'], { companyId: 'incab', sector: 'Промышленность', industry: 'Кабельная промышленность', sources: [moexIssue('INCB')] });
add(['NAUK'], { companyId: 'npo-nauka', sector: 'Промышленность', industry: 'Авиакосмическая отрасль', sources: [moexIssue('NAUK')] });
add(['DZRD', 'DZRDP'], { companyId: 'donskoy-radio', sector: 'Промышленность', industry: 'Электротехника', sources: [moexIssue('DZRD')] });
add(['PRFN'], { companyId: 'teplant', sector: 'Промышленность', industry: 'Строительные материалы', sources: [moexIssue('PRFN')] });
add(['GTRK'], { companyId: 'globaltruck', sector: 'Промышленность', industry: 'Автоперевозки', sources: [moexIssue('GTRK')] });
add(['LVHK'], { companyId: 'levenhuk', sector: 'Промышленность', industry: 'Приборостроение', sources: [moexIssue('LVHK')] });

add(['PIKK'], { companyId: 'pik', sector: 'Недвижимость', industry: 'Девелопмент', sources: [moexIssue('PIKK'), src('ПИК — о компании', 'https://www.pik.ru/')] });
add(['LSRG'], { companyId: 'lsr', sector: 'Недвижимость', industry: 'Девелопмент', sources: [moexIssue('LSRG'), moexIndex('MOEXRE', INDEX_TITLES.MOEXRE)] });
add(['ETLN'], { companyId: 'etalon', sector: 'Недвижимость', industry: 'Девелопмент', sources: [moexIssue('ETLN'), moexIndex('MOEXRE', INDEX_TITLES.MOEXRE)] });
add(['GLRX'], { companyId: 'glorax', sector: 'Недвижимость', industry: 'Девелопмент', sources: [moexIssue('GLRX'), moexIndex('MOEXRE', INDEX_TITLES.MOEXRE)] });
add(['KFBA'], { companyId: 'ingrad', sector: 'Недвижимость', industry: 'Девелопмент', sources: [moexIssue('KFBA')] });
add(['APRI'], { companyId: 'apri', sector: 'Недвижимость', industry: 'Девелопмент', sources: [moexIssue('APRI')] });
add(['WTCM', 'WTCMP'], { companyId: 'wtc-moscow', sector: 'Недвижимость', industry: 'Коммерческая недвижимость', sources: [moexIssue('WTCM')] });

add(['MDMG'], { companyId: 'md-medical', sector: 'Здравоохранение', industry: 'Медицинские услуги', sources: [moexIssue('MDMG'), src('MD Medical — IR', 'https://mdmedical.com/')] });
add(['GEMC'], { companyId: 'united-medical-group', sector: 'Здравоохранение', industry: 'Медицинские услуги', sources: [moexIssue('GEMC')] });
add(['PRMD'], { companyId: 'promomed', sector: 'Здравоохранение', industry: 'Фармацевтика', sources: [moexIssue('PRMD')] });
add(['APTK'], { companyId: 'apteka-36-6', sector: 'Здравоохранение', industry: 'Аптечная розница', sources: [moexIssue('APTK')] });
add(['ABIO'], { companyId: 'artgen', sector: 'Здравоохранение', industry: 'Биотехнологии', sources: [moexIssue('ABIO')] });
add(['GEMA'], { companyId: 'gemabank', sector: 'Здравоохранение', industry: 'Медицинские услуги', sources: [moexIssue('GEMA')] });
add(['GECO'], { companyId: 'genetico', sector: 'Здравоохранение', industry: 'Медицинские услуги', sources: [moexIssue('GECO')] });
add(['LIFE'], { companyId: 'pharmsynthez', sector: 'Здравоохранение', industry: 'Фармацевтика', sources: [moexIssue('LIFE')] });

export function classificationForTickers(tickers) {
  for (const t of tickers) {
    if (BY_TICKER[t]) return { ...BY_TICKER[t], matchedTicker: t };
  }
  return null;
}
