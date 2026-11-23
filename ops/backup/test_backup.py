import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backup', Path(__file__).with_name('backup.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

class BackupTests(unittest.TestCase):
    def env(self):
        return dict(BACKUP_ACTIVATION_APPROVED='yes', DATABASE_URL='postgresql://worker:p%3Aa@db:5432/railway',
                    BACKUP_BUCKET='private-test', BACKUP_ENDPOINT='https://storage.example.invalid',
                    AWS_ACCESS_KEY_ID='synthetic', AWS_SECRET_ACCESS_KEY='synthetic',
                    BACKUP_PREFIX='crm/daily/', BACKUP_MAX_BYTES='10000', BACKUP_PGSSLMODE='require')
    def test_inactive(self):
        with self.assertRaises(ValueError): b.validate({})
    def test_no_retention_deletion(self):
        env=self.env(); env['BACKUP_RETENTION_DELETE']='yes'
        with self.assertRaises(ValueError): b.validate(env)
    def test_prefix_scope(self):
        env=self.env(); env['BACKUP_PREFIX']='../'
        with self.assertRaises(ValueError): b.validate(env)
    def test_size_safeguard_required(self):
        env=self.env(); del env['BACKUP_MAX_BYTES']
        with self.assertRaises(ValueError): b.validate(env)
    def test_https(self):
        env=self.env(); env['BACKUP_ENDPOINT']='http://storage.example.invalid'
        with self.assertRaises(ValueError): b.validate(env)
    def test_private_policy(self):
        env=self.env(); env['BACKUP_PGSSLMODE']='disable'
        u,_=b.validate(env)
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError): b.pg_environment(env,u,d)
    def test_password_not_in_args_environment(self):
        env=self.env(); u,_=b.validate(env)
        with tempfile.TemporaryDirectory() as d:
            pg=b.pg_environment(env,u,d)
            self.assertNotIn('DATABASE_URL',pg)
            self.assertEqual(pg['PGOPTIONS'],'-c default_transaction_read_only=on')
            self.assertIn('p\\:a',Path(pg['PGPASSFILE']).read_text())
            self.assertEqual(Path(pg['PGPASSFILE']).stat().st_mode & 0o777,0o600)
    def test_bad_upload_does_not_verify(self):
        class Bad:
            def upload_file(*a,**k): pass
            def head_object(*a,**k): return {'ContentLength':0}
        with self.assertRaises(RuntimeError): b.upload_verified(Bad(),'b','k',Path('/unused'),'x',10)
    def test_corrupt_uploaded_bytes(self):
        class Bad:
            def upload_file(*a,**k): pass
            def head_object(*a,**k): return {'ContentLength':3,'Metadata':{'sha256':'expected'}}
            def get_object(*a,**k): return {'Body':io.BytesIO(b'bad')}
        with self.assertRaises(RuntimeError): b.upload_verified(Bad(),'b','k',Path('/unused'),'expected',3)
    def test_tool_error_does_not_echo_secrets(self):
        class Result: returncode=1; stdout=b''; stderr=b'private customer and secret data'
        with patch.object(b.subprocess,'run',return_value=Result()):
            with self.assertRaisesRegex(RuntimeError,'^database tool failed$'): b.run_private(['test'],{})


class FullFlowTests(unittest.TestCase):
    def env(self):
        return BackupTests().env()
    class Storage:
        def __init__(self): self.objects={}; self.puts=[]
        def upload_file(self,path,bucket,key,ExtraArgs):
            self.objects[key]=(Path(path).read_bytes(),ExtraArgs['Metadata'])
        def head_object(self,Bucket,Key):
            data,meta=self.objects[Key]
            return {'ContentLength':len(data),'Metadata':meta}
        def get_object(self,Bucket,Key): return {'Body':io.BytesIO(self.objects[Key][0])}
        def put_object(self,**kw): self.puts.append(kw)
    def fake_database(self,args,env,timeout=180):
        self.assertNotIn('DATABASE_URL',env)
        self.assertNotIn('PGPASSWORD',env)
        if args[0]=='pg_dump':
            self.assertIn('--lock-wait-timeout=10s',args)
            Path(args[args.index('--file')+1]).write_bytes(b'synthetic archive')
        else:
            self.assertEqual(args[:2],['pg_restore','--list'])
        return b''
    def test_success_upload_and_metadata_no_deletion(self):
        storage=self.Storage()
        with patch.object(b,'run_private',side_effect=self.fake_database):
            result=b.main(self.env(),storage)
        self.assertTrue(result['uploaded_bytes_verified'])
        self.assertFalse(result['restore_tested'])
        self.assertEqual(len(storage.puts),1)
        self.assertTrue(storage.puts[0]['Key'].endswith('.verified.json'))
        self.assertNotIn(b'p%3Aa',storage.puts[0]['Body'])
    def test_archive_failure_no_upload(self):
        storage=self.Storage()
        def fail(args,env,timeout=180):
            if args[0]=='pg_restore': raise RuntimeError('synthetic failure')
            return self.fake_database(args,env,timeout)
        with patch.object(b,'run_private',side_effect=fail):
            with self.assertRaises(RuntimeError): b.main(self.env(),storage)
        self.assertFalse(storage.objects)
        self.assertFalse(storage.puts)
    def test_size_failure_no_upload(self):
        storage=self.Storage(); env=self.env(); env['BACKUP_MAX_BYTES']='1'
        with patch.object(b,'run_private',side_effect=self.fake_database):
            with self.assertRaises(RuntimeError): b.main(env,storage)
        self.assertFalse(storage.objects)
    def test_unique_object_keys(self):
        storage=self.Storage()
        with patch.object(b,'run_private',side_effect=self.fake_database):
            b.main(self.env(),storage); b.main(self.env(),storage)
        self.assertEqual(len(storage.objects),2)

if __name__=='__main__': unittest.main()
