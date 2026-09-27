from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import Batch, Brand, Category, Product

# name, chemical, sku, category, brand, distributor, packaging, type, unit, cost, price, stock, batch, expiry
DEMO = [
    ('Coragen 20 SC', 'Chlorantraniliprole 18.5% w/w', 'SKU-FMC-0492', 'Insecticide', 'FMC Corporation', 'Agri-Tech Ltd', '50ml', 'Liquid SC', 'Bottles', 1450, 1850, 145, 'FMC-890', date(2026, 11, 30)),
    ('Belt 480 SC', 'Flubendiamide 480 g/L', 'SKU-BAY-1102', 'Insecticide', 'Bayer CropScience', 'Direct Import', '100ml', 'Suspension', 'Bottles', 2900, 3550, 52, 'BY-441', date(2027, 3, 31)),
    ('Amistar Top', 'Azoxystrobin + Difenoconazole', 'SKU-SYN-0881', 'Fungicide', 'Syngenta Ag', 'Authorized Supply', '200ml', 'Liquid SC', 'Bottles', 2150, 2680, 8, 'SN-129', date(2026, 12, 31)),
    ('Zorawar DAP', 'Nitrogen 18% + Phosphorus 46%', 'SKU-ENG-9921', 'Fertilizer', 'Engro Fertilizers', 'Factory Depo', '50kg Bag', 'Granular', 'Bags', 10850, 11400, 320, 'ENG-24', date(2028, 12, 31)),
    ('Target Glyphosate', 'Glyphosate 48% SL', 'SKU-AA-7013', 'Herbicide', 'Ali Akbar Group', 'Regional Supply', '1 Litre', 'Herbicide SL', 'Cans', 950, 1280, 64, 'AA-309', date(2027, 1, 31)),
    ('Match 050 EC', 'Lufenuron 50 g/L IGR', 'SKU-SYN-0402', 'Insecticide', 'Syngenta Ag', 'Authorized Supply', '250ml', 'Emulsifiable Con.', 'Bottles', 1600, 2050, 92, 'SN-882', date(2026, 8, 31)),
    ('Nativo 75 WG', 'Tebuconazole + Trifloxystrobin', 'SKU-BAY-0341', 'Fungicide', 'Bayer CropScience', 'Direct Import', '100g', 'Water Granules', 'Packets', 1780, 2200, 38, 'BY-910', date(2026, 10, 31)),
    ('Engro Urea (Prilled)', 'Nitrogen 46% Total Fertilizer', 'SKU-ENG-1044', 'Fertilizer', 'Engro Fertilizers', 'Factory Depo', '50kg Bag', 'White Granule', 'Bags', 3650, 3900, 450, 'UR-2024', date(2028, 12, 31)),
    ('Karate 2.5 EC', 'Lambda-Cyhalothrin 25 g/L', 'SKU-SYN-0019', 'Insecticide', 'Syngenta Ag', 'Authorized Supply', '1 Litre', 'Pyrethroid', 'Litres', 1820, 2350, 0, 'SN-005', date(2026, 9, 30)),
    ('Sitara 80 WDG', 'Elemental Sulfur 80% Tech', 'SKU-AA-4482', 'Fungicide', 'Ali Akbar Group', 'Regional Supply', '10kg Drum', 'Water Dispersible', 'Drums', 3100, 3850, 24, 'AA-881', date(2027, 2, 28)),
]


class Command(BaseCommand):
    help = 'Create sample products (idempotent by SKU) so the catalog UI has data in development.'

    @transaction.atomic
    def handle(self, *args, **options):
        created = 0
        for name, chem, sku, cat, brand, dist, pack, ftype, unit, cost, price, stock, batch, expiry in DEMO:
            if Product.objects.filter(sku=sku).exists():
                continue
            product = Product.objects.create(
                name=name, chemical=chem, sku=sku,
                category=Category.objects.get_or_create(name=cat)[0],
                brand=Brand.objects.get_or_create(name=brand)[0],
                distributor=dist, packaging=pack, formulation_type=ftype, stock_unit=unit,
                purchase_price=Decimal(cost), selling_price=Decimal(price),
            )
            Batch.objects.create(product=product, batch_no=batch, expiry_date=expiry, quantity=Decimal(stock))
            created += 1
        if options.get('verbosity', 1) > 0:
            self.stdout.write(self.style.SUCCESS(f'Seeded {created} demo product(s).'))
