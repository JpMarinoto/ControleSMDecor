# Unifica Material em Produto (eh_insumo) e migra compras/insumos/estoque.

from django.db import migrations, models
import django.db.models.deletion


def migrate_materiais_para_produtos(apps, schema_editor):
    Material = apps.get_model("financeiro", "Material")
    Produto = apps.get_model("financeiro", "Produto")
    ProdutoInsumo = apps.get_model("financeiro", "ProdutoInsumo")
    CompraMaterial = apps.get_model("financeiro", "CompraMaterial")
    CompraProduto = apps.get_model("financeiro", "CompraProduto")
    AjusteEstoque = apps.get_model("financeiro", "AjusteEstoque")
    AjusteEstoqueProduto = apps.get_model("financeiro", "AjusteEstoqueProduto")

    id_map = {}
    for m in Material.objects.all().iterator():
        p = Produto.objects.create(
            ativo=m.ativo,
            nome=m.nome,
            categoria_id=m.categoria_id,
            eh_insumo=True,
            revenda=False,
            fabricado=False,
            fornecedor_id=m.fornecedor_padrao_id,
            preco_custo=m.preco_unitario_base or 0,
            preco_fabricacao=m.preco_fabricacao,
            mao_obra_unitaria=0,
            margem_lucro_percent=0,
            preco_venda=0,
            descricao="",
            estoque_atual=m.estoque_atual or 0,
        )
        id_map[m.id] = p.id

    # ProdutoInsumo: material_id -> insumo_id
    for pi in list(ProdutoInsumo.objects.all()):
        new_id = id_map.get(pi.material_id)
        if new_id:
            pi.insumo_id = new_id
            pi.save(update_fields=["insumo_id"])
        else:
            pi.delete()

    # CompraMaterial -> CompraProduto
    for cm in CompraMaterial.objects.all().iterator():
        new_id = id_map.get(cm.material_id)
        if not new_id:
            continue
        CompraProduto.objects.create(
            produto_id=new_id,
            fornecedor_id=cm.fornecedor_id,
            quantidade=cm.quantidade,
            preco_no_dia=cm.preco_no_dia,
            data_lancamento=cm.data_lancamento,
            data_compra=cm.data_compra,
            ordem_id=cm.ordem_id,
            marcada_paga=cm.marcada_paga,
        )

    # AjusteEstoque -> AjusteEstoqueProduto
    for aj in AjusteEstoque.objects.all().order_by("data").iterator():
        new_id = id_map.get(aj.material_id)
        if not new_id:
            continue
        obs = (aj.observacao or "").strip()
        prefix = f"[{aj.tipo}] "
        if not obs.startswith(prefix):
            obs = (prefix + obs)[:255]
        obj = AjusteEstoqueProduto.objects.create(
            produto_id=new_id,
            quantidade=aj.quantidade,
            observacao=obs,
        )
        AjusteEstoqueProduto.objects.filter(pk=obj.pk).update(data=aj.data)

class Migration(migrations.Migration):

    dependencies = [
        ("financeiro", "0047_reatribui_precificacao_chefe_ativo"),
    ]

    operations = [
        migrations.AddField(
            model_name="produto",
            name="eh_insumo",
            field=models.BooleanField(default=False, verbose_name="Insumo"),
        ),
        migrations.AddField(
            model_name="produto",
            name="preco_fabricacao",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                help_text="Opcional: preço usado só no custo de insumos de fabricados. Compras/estoque usam preco_custo.",
                max_digits=14,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="produtoinsumo",
            name="insumo",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="usado_em_fabricacoes",
                to="financeiro.produto",
            ),
        ),
        migrations.RunPython(migrate_materiais_para_produtos, migrations.RunPython.noop),
        migrations.AlterUniqueTogether(
            name="produtoinsumo",
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name="produtoinsumo",
            name="material",
        ),
        migrations.AlterField(
            model_name="produtoinsumo",
            name="insumo",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="usado_em_fabricacoes",
                to="financeiro.produto",
            ),
        ),
        migrations.AlterUniqueTogether(
            name="produtoinsumo",
            unique_together={("produto", "insumo")},
        ),
        migrations.DeleteModel(
            name="CompraMaterial",
        ),
        migrations.DeleteModel(
            name="AjusteEstoque",
        ),
        migrations.DeleteModel(
            name="Material",
        ),
        migrations.AlterField(
            model_name="categoriaproduto",
            name="tipo",
            field=models.CharField(
                choices=[("produto", "Categoria de Produto"), ("material", "Categoria de Insumo")],
                default="produto",
                max_length=20,
            ),
        ),
    ]
