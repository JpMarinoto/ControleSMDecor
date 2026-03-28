##Para atualizar do localhost para vps primeiro preparar o git no local##

git status
git add .
git commit -m "Atualizacao"
git push

##Depois na vps fazer os procedimentos

ssh deploy@129.121.53.239
cd "/home/deploy/ControleSMDecor"
git pull
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
cd "Financial Control System" && npm install && npm run build && cd ..
sudo systemctl restart financeiro
sudo systemctl reload nginx


db-local-2026-03-28_114945 esse é o arquivo ele esta em C:\Users\jpsma\OneDrive\Documentos\BackupBancoControle, quero mandar ele para vps junto as alt