from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('financeiro', '0029_data_lancamento_venda_compra'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordemcompra',
            name='cancelada',
            field=models.BooleanField(default=False, verbose_name='Cancelada'),
        ),
    ]
