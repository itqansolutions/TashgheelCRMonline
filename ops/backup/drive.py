"""Drive trial adapter. No schedule, overwrite, deletion or sharing operations."""
import hashlib
import http.client
import json
import ssl
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

SCOPE = 'https://www.googleapis.com/auth/drive.file'
API = 'https://www.googleapis.com/drive/v3/files'

class Drive:
    def __init__(self, client, token, opener=urlopen):
        if token.get('scope') != SCOPE:
            raise ValueError('exact narrow authorization required')
        self.opener = opener
        self.token = token['access_token']
        self.client = client

    def request(self, url, method='GET', data=None, content_type=None):
        headers = {'Authorization': 'Bearer ' + self.token}
        if content_type:
            headers['Content-Type'] = content_type
        req = Request(url, data=data, headers=headers, method=method)
        return self.opener(req, timeout=30)

    def folder(self, name):
        # Always a new private folder, never touch existing Drive content.
        body = json.dumps({'name': name, 'mimeType': 'application/vnd.google-apps.folder'}).encode()
        with self.request(API + '?fields=id,webViewLink', 'POST', body, 'application/json') as r:
            obj = json.load(r)
        if not obj.get('id'):
            raise RuntimeError('folder creation failed')
        return obj

    def upload(self, path, name, parent, sha):
        size = path.stat().st_size
        metadata = json.dumps({'name': name, 'parents': [parent],
            'appProperties': {'sha256': sha, 'purpose': 'tashgheel-single-trial'}}).encode()
        url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,webViewLink,md5Checksum'
        with self.request(url, 'POST', metadata, 'application/json') as r:
            location = r.headers.get('Location')
        u = urlsplit(location or '')
        if u.scheme != 'https' or u.hostname != 'www.googleapis.com':
            raise RuntimeError('invalid upload session')
        # Stream the local archive, no second full archive in memory.
        conn = http.client.HTTPSConnection(u.hostname, timeout=30, context=ssl.create_default_context())
        try:
            conn.putrequest('PUT', u.path + ('?' + u.query if u.query else ''))
            conn.putheader('Authorization', 'Bearer ' + self.token)
            conn.putheader('Content-Type', 'application/octet-stream')
            conn.putheader('Content-Length', str(size))
            conn.endheaders()
            with path.open('rb') as stream:
                while True:
                    chunk = stream.read(1024 * 1024)
                    if not chunk:
                        break
                    conn.send(chunk)
            r = conn.getresponse()
            if r.status not in (200, 201):
                raise RuntimeError('Drive upload failed')
            obj = json.loads(r.read())
        finally:
            conn.close()
        if int(obj.get('size', -1)) != size or not obj.get('id'):
            raise RuntimeError('Drive metadata mismatch')
        h, received = hashlib.sha256(), 0
        with self.request(API + '/' + obj['id'] + '?alt=media') as stream:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                received += len(chunk)
                if received > size:
                    raise RuntimeError('Drive readback exceeds archive')
                h.update(chunk)
        if received != size or h.hexdigest() != sha:
            raise RuntimeError('Drive readback checksum mismatch')
        return obj
