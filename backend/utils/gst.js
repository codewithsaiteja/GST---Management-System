// GST rate slabs
const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28];

function calcGST({ taxableValue, gstRate, supplyType, sellerState, buyerState }) {
  const tax = (taxableValue * gstRate) / 100;
  const isInter = supplyType === 'inter' || sellerState !== buyerState;
  return isInter
    ? { cgst: 0, sgst: 0, igst: parseFloat(tax.toFixed(2)) }
    : { cgst: parseFloat((tax/2).toFixed(2)), sgst: parseFloat((tax/2).toFixed(2)), igst: 0 };
}

function calcInvoiceTotals(items, supplyType, sellerState, buyerState) {
  let totals = { taxable_value: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total_amount: 0 };
  
  // Validate supply type and states
  const isInter = supplyType === 'inter' || sellerState !== buyerState;
  
  for (const item of items) {
    const tv = parseFloat(((item.quantity * item.unit_price) * (1 - (item.discount || 0)/100)).toFixed(2));
    const gst = calcGST({ taxableValue: tv, gstRate: item.gst_rate, supplyType, sellerState, buyerState });
    const cess = parseFloat(((tv * (item.cess_rate || 0)) / 100).toFixed(2));
    
    item.taxable_value = tv;
    
    // Ensure proper GST logic: either CGST+SGST OR IGST, never both
    if (isInter) {
      // Inter-state: only IGST
      item.cgst_rate = 0;
      item.sgst_rate = 0;
      item.igst_rate = item.gst_rate;
      item.cgst = 0;
      item.sgst = 0;
      item.igst = gst.igst;
    } else {
      // Intra-state: only CGST+SGST
      item.cgst_rate = item.gst_rate / 2;
      item.sgst_rate = item.gst_rate / 2;
      item.igst_rate = 0;
      item.cgst = gst.cgst;
      item.sgst = gst.sgst;
      item.igst = 0;
    }
    
    item.cess = cess;
    item.total = parseFloat((tv + item.cgst + item.sgst + item.igst + cess).toFixed(2));
    
    totals.taxable_value += tv; 
    totals.cgst += item.cgst; 
    totals.sgst += item.sgst;
    totals.igst += item.igst; 
    totals.cess += cess;
  }
  
  totals.total_amount = parseFloat((totals.taxable_value + totals.cgst + totals.sgst + totals.igst + totals.cess).toFixed(2));
  ['taxable_value','cgst','sgst','igst','cess'].forEach(k => totals[k] = parseFloat(totals[k].toFixed(2)));
  
  // Final validation: ensure no invoice has both CGST/SGST and IGST
  if (totals.cgst > 0 && totals.igst > 0) {
    throw new Error('Invalid GST calculation: Invoice cannot have both CGST/SGST and IGST');
  }
  if (totals.sgst > 0 && totals.igst > 0) {
    throw new Error('Invalid GST calculation: Invoice cannot have both CGST/SGST and IGST');
  }
  
  return totals;
}

function validateGSTIN(gstin) {
  if (!gstin) return false;
  const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return regex.test(gstin.toUpperCase());
}

function getStateFromGSTIN(gstin) {
  const stateCode = gstin?.substring(0, 2);
  return STATE_CODES[stateCode] || 'Unknown';
}

function generateIRN(gstin, invoiceNo, financialYear, docType = 'INV') {
  const data = `${gstin}|${docType}|${financialYear}|${invoiceNo}`;
  // Simplified IRN hash (real implementation uses SHA-256)
  let hash = 0;
  for (let c of data) hash = ((hash << 5) - hash) + c.charCodeAt(0);
  return Math.abs(hash).toString(16).padStart(64, '0').substring(0, 64);
}

function getFinancialYear(date) {
  const d = new Date(date || Date.now());
  const y = d.getFullYear(), m = d.getMonth();
  return m >= 3 ? `${y}-${(y+1).toString().slice(2)}` : `${y-1}-${y.toString().slice(2)}`;
}

function getReturnPeriod(date, type = 'monthly') {
  const d = new Date(date || Date.now());
  if (type === 'annual') return getFinancialYear(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${month}${d.getFullYear()}`;
}

const STATE_CODES = {
  '01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh',
  '05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh',
  '10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur',
  '15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal',
  '20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh',
  '24':'Gujarat','25':'Daman & Diu','26':'Dadra & Nagar Haveli','27':'Maharashtra',
  '28':'Andhra Pradesh (Old)','29':'Karnataka','30':'Goa','31':'Lakshadweep',
  '32':'Kerala','33':'Tamil Nadu','34':'Puducherry','35':'Andaman & Nicobar',
  '36':'Telangana','37':'Andhra Pradesh','38':'Ladakh','97':'Other Territory','99':'Centre'
};

module.exports = { calcGST, calcInvoiceTotals, validateGSTIN, getStateFromGSTIN, generateIRN, getFinancialYear, getReturnPeriod, STATE_CODES, GST_RATES };
