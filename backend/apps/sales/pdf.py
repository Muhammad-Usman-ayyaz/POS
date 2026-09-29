import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .models import Sale

BRAND_GREEN = colors.HexColor('#147A5F')
LINE_GREY = colors.HexColor('#D6E4E0')


def render_invoice_pdf(sale: Sale) -> bytes:
    """Renders a one-page A4 invoice for a completed or cancelled sale. Returns raw PDF bytes."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=18 * mm, rightMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('InvoiceTitle', parent=styles['Title'], textColor=BRAND_GREEN, fontSize=20, spaceAfter=2)
    label_style = ParagraphStyle('Label', parent=styles['Normal'], textColor=colors.grey, fontSize=8)
    value_style = ParagraphStyle('Value', parent=styles['Normal'], fontSize=10)

    items = list(sale.items.select_related('product', 'batch').all())

    elements = [
        Paragraph('Pesticide Club', title_style),
        Paragraph('Agri Retail &amp; Khata ERP', label_style),
        Spacer(1, 10 * mm),
    ]

    header_rows = [
        [Paragraph('INVOICE', label_style), Paragraph('BILLED TO', label_style)],
        [
            Paragraph(f'<b>{sale.invoice_no}</b>', value_style),
            Paragraph(f'<b>{sale.customer.name}</b>' if sale.customer else '<b>Walk-in Customer</b>', value_style),
        ],
        [
            Paragraph(f'Date: {sale.sale_date.strftime("%d %b %Y")}', value_style),
            Paragraph(sale.customer.phone if (sale.customer and sale.customer.phone) else '', value_style),
        ],
        [
            Paragraph(f'Payment: {sale.get_payment_method_display()}', value_style),
            Paragraph(sale.customer.village if (sale.customer and sale.customer.village) else '', value_style),
        ],
        [
            Paragraph(f'Status: {sale.get_status_display()}', value_style),
            Paragraph('', value_style),
        ],
    ]
    header_table = Table(header_rows, colWidths=[85 * mm, 85 * mm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 8 * mm))

    table_data = [['#', 'Product', 'Batch', 'Qty', 'Unit Price', 'Line Total']]
    for i, item in enumerate(items, start=1):
        table_data.append([
            str(i), item.product.name, item.batch.batch_no,
            f'{item.quantity:g}', f'Rs. {item.unit_price:,.2f}', f'Rs. {item.line_total:,.2f}',
        ])

    items_table = Table(table_data, colWidths=[10 * mm, 60 * mm, 25 * mm, 20 * mm, 30 * mm, 30 * mm])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BRAND_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, LINE_GREY),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F2FDF9')]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 6 * mm))

    totals_data = [
        ['Subtotal', f'Rs. {sale.subtotal:,.2f}'],
        ['Discount', f'Rs. {sale.discount_amount:,.2f}'],
        ['Total', f'Rs. {sale.total_amount:,.2f}'],
        ['Paid Amount', f'Rs. {sale.paid_amount:,.2f}'],
        ['Remaining Balance', f'Rs. {sale.balance:,.2f}'],
    ]
    totals_table = Table(totals_data, colWidths=[145 * mm, 30 * mm], hAlign='RIGHT')
    totals_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 2), (-1, 2), 'Helvetica-Bold'),
        ('LINEABOVE', (0, 2), (-1, 2), 0.75, BRAND_GREEN),
        ('TEXTCOLOR', (0, 4), (-1, 4), colors.HexColor('#ba1a1a') if sale.balance > 0 else colors.HexColor('#146c43')),
        ('FONTNAME', (0, 4), (-1, 4), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    elements.append(totals_table)

    if sale.notes:
        elements.append(Spacer(1, 8 * mm))
        elements.append(Paragraph(f'<b>Note:</b> {sale.notes}', value_style))

    elements.append(Spacer(1, 14 * mm))
    elements.append(Paragraph('Thank you for your business.', label_style))

    doc.build(elements)
    return buffer.getvalue()
