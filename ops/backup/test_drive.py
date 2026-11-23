import io,json,unittest
from drive import Drive,SCOPE
class Response(io.BytesIO):
    def __init__(self,obj):
        super().__init__(json.dumps(obj).encode());self.headers={}
class DriveTests(unittest.TestCase):
    def test_broad_scope_rejected(self):
        with self.assertRaises(ValueError):Drive({},dict(access_token='synthetic',scope='https://www.googleapis.com/auth/drive'))
    def test_extra_scope_rejected(self):
        with self.assertRaises(ValueError):Drive({},dict(access_token='synthetic',scope=SCOPE+' email'))
    def test_folder_private_new(self):
        calls=[]
        def op(req,timeout):
            calls.append(req)
            return Response(dict(id='synthetic-folder'))
        d=Drive({},dict(access_token='synthetic',scope=SCOPE),op)
        self.assertEqual(d.folder('synthetic')['id'],'synthetic-folder')
        req=calls[0]
        self.assertEqual(req.method,'POST')
        body=json.loads(req.data)
        self.assertNotIn('permissions',body)
        self.assertNotIn('parents',body)
        self.assertEqual(body['mimeType'],'application/vnd.google-apps.folder')
    def test_invalid_upload_host_rejected(self):
        import tempfile
        from pathlib import Path
        def op(req,timeout):
            r=Response({});r.headers={'Location':'https://untrusted.invalid/upload'};return r
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'x';p.write_bytes(b'synthetic')
            d=Drive({},dict(access_token='synthetic',scope=SCOPE),op)
            with self.assertRaises(RuntimeError):d.upload(p,'x','synthetic','x')
if __name__=='__main__':unittest.main()
