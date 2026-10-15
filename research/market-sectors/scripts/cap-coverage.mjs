'use strict';

/**
 * Listed TQBR issue cap vs full issuer equity capital.
 * Does not estimate missing classes.
 */

const OLD_INACTIVE_BOARDS = new Set([
  'EQBR', 'EQNL', 'EQNE', 'EQBS', 'EQDE', 'EQCC', 'EQDP', 'EQLI', 'EQLV'
]);

function isHistoricalAlias(row, listedSecids) {
  if (listedSecids.includes(row.secid)) return true;
  return listedSecids.some((s) => row.secid === s + '03' || row.secid === s + 'P03');
}

export function distinctExtraIssues(listedSecs, issRows) {
  const listedSecids = listedSecs.map((s) => s.secid || s.ticker);
  const listedIsins = new Set(listedSecs.map((s) => s.isin).filter(Boolean));
  return (issRows || []).filter((r) => {
    if (!r || (r.type !== 'common_share' && r.type !== 'preferred_share')) return false;
    if (listedSecids.includes(r.secid)) return false;
    if (r.isin && listedIsins.has(r.isin)) return false;
    if (isHistoricalAlias(r, listedSecids)) return false;
    if (OLD_INACTIVE_BOARDS.has(r.primary_boardid) && Number(r.is_traded) === 0) return false;
    return true;
  });
}

export function classifyMarketCapCoverage(company, listedSecs, issRows) {
  const listed = listedSecs || [];
  const listedTypes = new Set(listed.map((s) => s.shareClass));
  const extra = distinctExtraIssues(listed, issRows);
  const extraTraded = extra.filter((r) => Number(r.is_traded) === 1);
  const extraPref = extra.filter((r) => r.type === 'preferred_share');
  const extraCommon = extra.filter((r) => r.type === 'common_share');
  const fmt = (rows) => rows.map((r) => r.secid + ':' + r.type + ':board=' + r.primary_boardid + ':traded=' + r.is_traded).join(', ');

  if (!listed.length) {
    return { marketCapCoverage: 'unknown', marketCapCoverageReason: 'нет бумаг компании в TQBR-выборке' };
  }

  if (!listedTypes.has('ordinary') && listedTypes.has('preferred')) {
    return {
      marketCapCoverage: 'partial',
      marketCapCoverageReason: 'в выборке только привилегированный выпуск; обыкновенные акции эмитента не входят в TQBR-universe, поэтому сумма included issues — не полный акционерный капитал'
    };
  }

  if (extraTraded.length) {
    return {
      marketCapCoverage: 'partial',
      marketCapCoverageReason: 'у эмитента есть другие торгуемые акции вне TQBR-выборки (' + fmt(extraTraded) + ')'
    };
  }

  if (listedTypes.has('ordinary') && !listedTypes.has('preferred') && extraPref.length) {
    return {
      marketCapCoverage: 'partial',
      marketCapCoverageReason: 'в справочнике MOEX ISS есть привилегированный выпуск, не входящий в активную TQBR-выборку (' + fmt(extraPref) + ')'
    };
  }

  if (listedTypes.has('preferred') && !listedTypes.has('ordinary') && extraCommon.length) {
    return {
      marketCapCoverage: 'partial',
      marketCapCoverageReason: 'в справочнике MOEX ISS есть обыкновенный выпуск, не входящий в активную TQBR-выборку (' + fmt(extraCommon) + ')'
    };
  }

  if (!company.emitentId) {
    return {
      marketCapCoverage: 'unknown',
      marketCapCoverageReason: 'нет emitent_id для сверки полного набора выпусков в MOEX ISS'
    };
  }

  const name = String(company.companyName || company.shortName || '');
  if (/\bltd\b|\binc\.?\b|limited|veon/i.test(name) || listed.some((s) => /veon/i.test(s.ticker || ''))) {
    return {
      marketCapCoverage: 'unknown',
      marketCapCoverageReason: 'иностранный эмитент: справочник MOEX ISS может не содержать все классы акционерного капитала'
    };
  }

  return {
    marketCapCoverage: 'full',
    marketCapCoverageReason: 'все известные по MOEX ISS классы акций эмитента входят в TQBR-выборку'
  };
}

export function coverageIndex(companies, securities, allIssShares) {
  const secByCo = {};
  (securities || []).forEach((s) => {
    (secByCo[s.companyId] = secByCo[s.companyId] || []).push(s);
  });
  const issByEmitent = {};
  (allIssShares || []).forEach((r) => {
    const k = String(r.emitent_id || '');
    if (!k) return;
    (issByEmitent[k] = issByEmitent[k] || []).push(r);
  });
  const byCompanyId = {};
  (companies || []).forEach((c) => {
    byCompanyId[c.companyId] = classifyMarketCapCoverage(
      c,
      secByCo[c.companyId] || [],
      issByEmitent[String(c.emitentId)] || []
    );
  });
  return byCompanyId;
}
