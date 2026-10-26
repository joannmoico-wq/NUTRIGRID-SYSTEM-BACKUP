import { WHO_GROWTH_STANDARDS } from './whoGrowthStandards.js';

const DAYS_PER_MONTH = 365.2425 / 12;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function parseLocalDate(value) {
  if (!value || typeof value !== 'string') return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function calculateAgeInYears(birthday, referenceDate = new Date()) {
  const birth = parseLocalDate(birthday);
  if (!birth || birth > referenceDate) return '';

  let years = referenceDate.getFullYear() - birth.getFullYear();
  const birthdayHasPassed =
    referenceDate.getMonth() > birth.getMonth() ||
    (referenceDate.getMonth() === birth.getMonth() && referenceDate.getDate() >= birth.getDate());
  if (!birthdayHasPassed) years -= 1;
  return String(years);
}

export function calculateAgeInMonths(birthday, weighingDate) {
  const birth = parseLocalDate(birthday);
  const weighing = parseLocalDate(weighingDate);
  if (!birth || !weighing || weighing < birth) return '';

  let months =
    (weighing.getFullYear() - birth.getFullYear()) * 12 +
    weighing.getMonth() -
    birth.getMonth();
  if (weighing.getDate() < birth.getDate()) months -= 1;
  return String(months);
}

function interpolateLms(rows, value) {
  if (!Number.isFinite(value) || rows.length === 0) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (value < first[0] || value > last[0]) return null;

  let upperIndex = rows.findIndex((row) => row[0] >= value);
  if (upperIndex < 0) upperIndex = rows.length - 1;
  const upper = rows[upperIndex];
  if (upper[0] === value || upperIndex === 0) return upper.slice(1);

  const lower = rows[upperIndex - 1];
  const ratio = (value - lower[0]) / (upper[0] - lower[0]);
  return lower.slice(1).map((coefficient, index) =>
    coefficient + ratio * (upper[index + 1] - coefficient)
  );
}

function calculateZScore(value, lms) {
  if (!Number.isFinite(value) || value <= 0 || !lms) return null;
  const [l, m, s] = lms;
  if (l === 0) return Math.log(value / m) / s;
  return (Math.pow(value / m, l) - 1) / (l * s);
}

function classifyWeightForAge(zScore) {
  if (zScore === null) return '';
  if (zScore < -3) return 'Severely underweight';
  if (zScore < -2) return 'Underweight';
  if (zScore > 2) return 'High weight-for-age';
  return 'Normal';
}

function classifyHeightForAge(zScore) {
  if (zScore === null) return '';
  if (zScore < -3) return 'Severely stunted';
  if (zScore < -2) return 'Stunted';
  if (zScore > 3) return 'Tall';
  return 'Normal';
}

function classifyWeightForLengthHeight(zScore) {
  if (zScore === null) return '';
  if (zScore < -3) return 'Severely wasted';
  if (zScore < -2) return 'Wasted';
  if (zScore > 3) return 'Obese';
  if (zScore > 2) return 'Overweight';
  if (zScore > 1) return 'At risk of overweight';
  return 'Normal';
}

export function calculateWhoGrowthStatuses({
  sex,
  birthday,
  weighingDate,
  weightKg,
  lengthCm,
  heightCm,
}) {
  const birth = parseLocalDate(birthday);
  const weighing = parseLocalDate(weighingDate);
  const weight = Number(weightKg);
  if (
    !birth ||
    !weighing ||
    weighing < birth ||
    !['boys', 'girls'].includes(sex) ||
    !Number.isFinite(weight) ||
    weight <= 0
  ) {
    return { w_a: '', h_a: '', w_l_h: '' };
  }

  const ageInMonths = (weighing.getTime() - birth.getTime()) / DAY_IN_MS / DAYS_PER_MONTH;
  const completedAgeInMonths = Number(calculateAgeInMonths(birthday, weighingDate));
  const fifthBirthday = new Date(birth);
  fifthBirthday.setFullYear(fifthBirthday.getFullYear() + 5);
  if (weighing > fifthBirthday) return { w_a: '', h_a: '', w_l_h: '' };
  const standardsAgeInMonths = Math.min(60, ageInMonths);

  const standards = WHO_GROWTH_STANDARDS[sex];
  const weightForAge = interpolateLms(standards.weightForAge, standardsAgeInMonths);
  const isUnderTwo = completedAgeInMonths < 24;
  const measurement = Number(isUnderTwo ? lengthCm : heightCm);
  const heightForAgeTable = isUnderTwo ? standards.lengthForAge : standards.heightForAge;
  const weightForLengthHeightTable = isUnderTwo
    ? standards.weightForLength
    : standards.weightForHeight;
  const heightAge = isUnderTwo ? standardsAgeInMonths : Math.max(24, standardsAgeInMonths);
  const heightForAge = interpolateLms(heightForAgeTable, heightAge);
  const weightForLengthHeight = interpolateLms(weightForLengthHeightTable, measurement);

  return {
    w_a: classifyWeightForAge(calculateZScore(weight, weightForAge)),
    h_a: classifyHeightForAge(calculateZScore(measurement, heightForAge)),
    w_l_h: classifyWeightForLengthHeight(calculateZScore(weight, weightForLengthHeight)),
  };
}
