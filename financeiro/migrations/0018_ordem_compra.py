# Generated manually for OrdemCompra and CompraMaterial.ordem

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('financeiro', '0017_precoclienteproduto'),
    ]

    operations = [
        migrations.CreateModel(
            name='OrdemCompra',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('data_compra', models.DateTimeField(auto_now_add=True)),
                ('fornecedor', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ordens_compra', to='financeiro.fornecedor')),
            ],
            options={
                'ordering': ['-data_compra'],
            },
        ),
        migrations.AddField(
            model_name='compramaterial',
            name='ordem',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='itens', to='financeiro.ordemcompra'),
        ),
    ]
