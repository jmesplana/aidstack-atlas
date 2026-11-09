export const ACCESS_AGE_GROUPS = [
  { id: 'all', label: 'All ages', ages: ['00','01','05','10','15','20','25','30','35','40','45','50','55','60','65','70','75','80','85','90'] },
  { id: 'under1', label: 'Under 1 year', ages: ['00'] },
  { id: 'under5', label: 'Under 5 years', ages: ['00','01'] },
  { id: '1_4', label: '1–4 years', ages: ['01'] },
  { id: '5_9', label: '5–9 years', ages: ['05'] },
  { id: '10_14', label: '10–14 years', ages: ['10'] },
  { id: '5_14', label: '5–14 years', ages: ['05','10'] },
  { id: '15_49', label: '15–49 years', ages: ['15','20','25','30','35','40','45'] },
];
export function accessCohort(value = {}) {
  const age = value.age || 'all', sex = value.sex || 'both';
  const group = ACCESS_AGE_GROUPS.find(g => g.id === age);
  if (!group || !['both', 'female', 'male'].includes(sex)) throw new Error('Choose a supported population age group and sex.');
  const total = age === 'all' && sex === 'both';
  return { age, sex, dataType: total ? 'total' : 'agesex', label: total ? 'All residents' : `${group.label} · ${sex === 'both' ? 'female and male' : sex}`,
    bands: total ? ['population'] : group.ages.flatMap(a => (sex === 'both' ? ['f','m'] : [sex === 'female' ? 'f' : 'm']).map(s => `${s}_${a}`)) };
}
