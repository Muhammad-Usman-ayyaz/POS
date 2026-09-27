from django.db import migrations

CATEGORIES = [
    'Insecticide', 'Herbicide', 'Fungicide', 'Fertilizer', 'Plant Growth Regulator', 'Bio-Stimulant',
]
BRANDS = [
    'Bayer CropScience', 'FMC Corporation', 'Syngenta Ag', 'Engro Fertilizers',
    'Ali Akbar Group', 'Corteva Agriscience', 'Kanzo AG',
]


def seed(apps, schema_editor):
    Category = apps.get_model('catalog', 'Category')
    Brand = apps.get_model('catalog', 'Brand')
    for name in CATEGORIES:
        Category.objects.get_or_create(name=name)
    for name in BRANDS:
        Brand.objects.get_or_create(name=name)


class Migration(migrations.Migration):
    dependencies = [('catalog', '0001_initial')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
