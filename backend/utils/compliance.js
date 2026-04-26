const { Compliance } = require('./db');

async function updateOverdueCompliance() {
  try {
    const today = new Date().toISOString().split('T')[0];
    await Compliance.updateMany({ due_date: { $lt: today }, status: 'pending' }, { status: 'overdue' });
  } catch(e) { console.error('Compliance update error:', e); }
}

async function generateComplianceCalendar(businessId, financialYear) {
  const [startYear] = financialYear.split('-');
  const fy = parseInt(startYear);
  const months = [
    {m:'04',y:fy},{m:'05',y:fy},{m:'06',y:fy},{m:'07',y:fy},{m:'08',y:fy},{m:'09',y:fy},
    {m:'10',y:fy},{m:'11',y:fy},{m:'12',y:fy},{m:'01',y:fy+1},{m:'02',y:fy+1},{m:'03',y:fy+1}
  ];
  for (const {m, y} of months) {
    const period = `${m}${y}`;
    const nextM = parseInt(m) === 12 ? '01' : String(parseInt(m)+1).padStart(2,'0');
    const nextY = parseInt(m) === 12 ? y+1 : y;
    await Compliance.findOneAndUpdate(
      { business_id: businessId, return_type: 'GSTR1', period },
      { $setOnInsert: { business_id: businessId, return_type: 'GSTR1', period, due_date: `${nextY}-${nextM}-11`, status: 'pending' } },
      { upsert: true }
    );
    await Compliance.findOneAndUpdate(
      { business_id: businessId, return_type: 'GSTR3B', period },
      { $setOnInsert: { business_id: businessId, return_type: 'GSTR3B', period, due_date: `${nextY}-${nextM}-20`, status: 'pending' } },
      { upsert: true }
    );
  }
  await Compliance.findOneAndUpdate(
    { business_id: businessId, return_type: 'GSTR9', period: financialYear },
    { $setOnInsert: { business_id: businessId, return_type: 'GSTR9', period: financialYear, due_date: `${fy+1}-12-31`, status: 'pending' } },
    { upsert: true }
  );
}

module.exports = { updateOverdueCompliance, generateComplianceCalendar };
