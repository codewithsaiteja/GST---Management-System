const router = require('express').Router();
const { Invoice, InvoiceItem, Business, Purchase } = require('../utils/db');
const { auth, requireBizAccess } = require('../middleware/auth');
const mongoose = require('mongoose');

router.get('/invoice/:id/pdf', auth, async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const inv = await Invoice.findById(req.params.id).lean();
    if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found' });
    const biz = await Business.findById(inv.business_id).lean();
    const items = await InvoiceItem.find({ invoice_id: req.params.id }).lean();

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice_${inv.invoice_number}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').text(biz?.legal_name || '', { align: 'center' });
    doc.font('Helvetica').text(`GSTIN: ${biz?.gstin || ''}`, { align: 'center' });
    if (biz?.address) doc.text(biz.address, { align: 'center' });
    doc.moveDown();

    doc.rect(40, doc.y, 515, 60).stroke();
    const detY = doc.y + 8;
    doc.fontSize(9).font('Helvetica-Bold').text('Invoice No:', 50, detY);
    doc.font('Helvetica').text(inv.invoice_number, 120, detY);
    doc.font('Helvetica-Bold').text('Date:', 300, detY);
    doc.font('Helvetica').text(inv.invoice_date, 340, detY);
    doc.font('Helvetica-Bold').text('Supply Type:', 50, detY+18);
    doc.font('Helvetica').text((inv.supply_type||'').toUpperCase(), 120, detY+18);
    doc.font('Helvetica-Bold').text('Status:', 300, detY+18);
    doc.font('Helvetica').text(inv.status||'', 340, detY+18);
    if (inv.irn) { doc.font('Helvetica-Bold').text('IRN:', 50, detY+36); doc.font('Helvetica').fontSize(7).text((inv.irn||'').substring(0,64), 75, detY+37); }
    doc.moveDown(4);

    if (inv.party_name) {
      doc.moveDown(0.5).fontSize(9).font('Helvetica-Bold').text('Bill To:');
      doc.font('Helvetica').text(inv.party_name);
      if (inv.party_gstin) doc.text(`GSTIN: ${inv.party_gstin}`);
      doc.moveDown(0.5);
    }

    const tY = doc.y;
    doc.rect(40, tY, 515, 18).fill('#2d3748');
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
    ['#','Description','HSN','Qty','Rate','Taxable','GST','Total'].forEach((h,i) => {
      const xs = [45,68,240,292,330,388,445,488];
      doc.text(h, xs[i], tY+5);
    });
    doc.fillColor('black');
    let rowY = tY + 18;
    items.forEach((item, i) => {
      if (rowY > 700) { doc.addPage(); rowY = 40; }
      const bg = i%2===0 ? '#f7fafc' : 'white';
      doc.rect(40, rowY, 515, 16).fill(bg).stroke('#e2e8f0');
      doc.fillColor('black').fontSize(8).font('Helvetica');
      doc.text(String(i+1),45,rowY+4,{width:20});
      doc.text((item.description||'').substring(0,28),68,rowY+4,{width:170});
      doc.text(item.hsn_sac||'',240,rowY+4,{width:50});
      doc.text(String(item.quantity),292,rowY+4,{width:35});
      doc.text((item.unit_price||0).toFixed(2),330,rowY+4,{width:55});
      doc.text((item.taxable_value||0).toFixed(2),388,rowY+4,{width:55});
      doc.text(((item.cgst||0)+(item.sgst||0)+(item.igst||0)).toFixed(2),445,rowY+4,{width:40});
      doc.text((item.total||0).toFixed(2),488,rowY+4,{width:60});
      rowY += 16;
    });

    rowY += 8;
    const totLines = [
      ['Taxable Value', inv.taxable_value],
      inv.cgst>0 ? ['CGST', inv.cgst] : null,
      inv.sgst>0 ? ['SGST', inv.sgst] : null,
      inv.igst>0 ? ['IGST', inv.igst] : null,
      ['Grand Total', inv.total_amount],
    ].filter(Boolean);
    totLines.forEach(([label, val], i) => {
      const isBold = i === totLines.length-1;
      if (isBold) doc.rect(40, rowY, 515, 18).fill('#2d3748');
      doc.font(isBold?'Helvetica-Bold':'Helvetica').fontSize(9).fillColor(isBold?'white':'black')
        .text(label, 350, rowY+4, {width:120, align:'right'})
        .text(`Rs. ${(val||0).toFixed(2)}`, 480, rowY+4, {width:68, align:'right'});
      doc.fillColor('black');
      rowY += 18;
    });
    doc.moveDown(2).fontSize(8).text('This is a computer generated invoice.', {align:'center'});
    doc.end();
  } catch(e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'PDF generation failed: '+e.message });
  }
});

router.get('/invoices/excel', auth, requireBizAccess, async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { business_id, from_date, to_date } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const filter = { business_id };
    if (from_date || to_date) { filter.invoice_date = {}; if (from_date) filter.invoice_date.$gte = from_date; if (to_date) filter.invoice_date.$lte = to_date; }
    const rows = await Invoice.find(filter).sort({ invoice_date: -1 }).lean();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sales Invoices');
    ws.columns = [
      {header:'Invoice No',key:'invoice_number',width:18},{header:'Date',key:'invoice_date',width:12},
      {header:'Party Name',key:'party_name',width:25},{header:'Party GSTIN',key:'party_gstin',width:18},
      {header:'Type',key:'invoice_type',width:8},{header:'Supply',key:'supply_type',width:10},
      {header:'Taxable',key:'taxable_value',width:14},{header:'CGST',key:'cgst',width:12},
      {header:'SGST',key:'sgst',width:12},{header:'IGST',key:'igst',width:12},
      {header:'Total',key:'total_amount',width:14},{header:'Status',key:'status',width:12},
    ];
    ws.getRow(1).eachCell(cell => { cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2D3748'}}; cell.font={bold:true,color:{argb:'FFFFFFFF'}}; });
    rows.forEach((r,i) => {
      const row = ws.addRow(r);
      if (i%2===0) row.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF7FAFC'}};});
      ['taxable_value','cgst','sgst','igst','total_amount'].forEach(k=>{row.getCell(k).numFmt='#,##0.00';});
    });
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="Invoices.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch(e) {
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Excel export failed: '+e.message });
  }
});

router.get('/dashboard-report', auth, requireBizAccess, async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const { business_id } = req.query;
    if (!business_id) return res.status(400).json({ success: false, message: 'business_id required' });
    const biz = await Business.findById(business_id).lean();
    if (!biz) return res.status(404).json({ success: false, message: 'Business not found' });
    const bid = new mongoose.Types.ObjectId(business_id);
    const now = new Date();
    const fyStart = now.getMonth() >= 3 ? `${now.getFullYear()}-04-01` : `${now.getFullYear()-1}-04-01`;

    const [summary] = await Invoice.aggregate([
      { $match: { business_id: bid, invoice_date: { $gte: fyStart }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total_invoices: { $sum: 1 }, total_sales: { $sum: '$taxable_value' }, total_tax: { $sum: { $add: ['$cgst','$sgst','$igst'] } } } }
    ]);
    const [itc] = await Purchase.aggregate([
      { $match: { business_id: bid, itc_eligible: 1 } },
      { $group: { _id: null, cgst: { $sum: '$cgst' }, sgst: { $sum: '$sgst' }, igst: { $sum: '$igst' } } }
    ]);
    const monthly = await Invoice.aggregate([
      { $match: { business_id: bid, invoice_date: { $gte: fyStart }, status: { $ne: 'cancelled' } } },
      { $group: { _id: { m: { $substr: ['$invoice_date',5,2] }, y: { $substr: ['$invoice_date',0,4] } }, taxable: { $sum: '$taxable_value' }, tax: { $sum: { $add: ['$cgst','$sgst','$igst'] } }, cnt: { $sum: 1 } } },
      { $sort: { '_id.y': 1, '_id.m': 1 } }
    ]);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Dashboard_Report_${biz.gstin}.pdf"`);
    doc.pipe(res);

    doc.fontSize(22).font('Helvetica-Bold').text('GST Dashboard Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica').text(biz.legal_name, { align: 'center' });
    doc.fontSize(9).text(`GSTIN: ${biz.gstin} | Generated: ${now.toLocaleDateString('en-IN')}`, { align: 'center' });
    doc.moveDown(1.5);

    const s = summary || {}; const itcTotal = ((itc?.cgst||0)+(itc?.sgst||0)+(itc?.igst||0));
    const stats = [
      ['Total Sales (FY)', `Rs. ${(s.total_sales||0).toFixed(2)}`],
      ['Total Tax Collected', `Rs. ${(s.total_tax||0).toFixed(2)}`],
      ['Total Invoices', String(s.total_invoices||0)],
      ['ITC Available', `Rs. ${itcTotal.toFixed(2)}`],
      ['Net Tax Liability', `Rs. ${((s.total_tax||0)-itcTotal).toFixed(2)}`],
    ];
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#2d3748').text('Summary');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    stats.forEach(([label, val]) => {
      const y = doc.y;
      doc.fillColor('#4a5568').text(label, 50, y, { width: 200 });
      doc.fillColor('#1a202c').font('Helvetica-Bold').text(val, 300, y, { width: 200, align: 'right' });
      doc.font('Helvetica'); doc.moveDown(0.4);
    });

    if (monthly.length) {
      doc.moveDown(1);
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#2d3748').text('Monthly Breakdown');
      doc.moveDown(0.5);
      const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const tY = doc.y;
      doc.rect(40, tY, 515, 18).fill('#2d3748');
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
      doc.text('Period', 50, tY+5); doc.text('Taxable Value', 200, tY+5); doc.text('Tax', 350, tY+5); doc.text('Invoices', 470, tY+5);
      doc.fillColor('black');
      let rowY = tY + 18;
      monthly.forEach((r, i) => {
        doc.rect(40, rowY, 515, 16).fill(i%2===0?'#f7fafc':'#ffffff');
        doc.fillColor('#2d3748').fontSize(9).font('Helvetica');
        doc.text(`${months[parseInt(r._id.m)]} ${r._id.y}`, 50, rowY+4);
        doc.text(`Rs. ${(r.taxable||0).toFixed(2)}`, 200, rowY+4);
        doc.text(`Rs. ${(r.tax||0).toFixed(2)}`, 350, rowY+4);
        doc.text(String(r.cnt), 470, rowY+4);
        rowY += 16;
      });
    }
    doc.moveDown(3).fontSize(8).fillColor('#a0aec0').text('This is a system generated report from GST Compliance System.', { align: 'center' });
    doc.end();
  } catch(e) {
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Report generation failed: '+e.message });
  }
});

module.exports = router;
