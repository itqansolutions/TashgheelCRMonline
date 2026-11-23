import unittest
from trial import guard
class TrialTests(unittest.TestCase):
    def cfg(self):return {'BACKUP_SINGLE_TRIAL_APPROVED':'yes','DATABASE_URL':'postgres://synthetic:synthetic@postgres.railway.internal:5432/synthetic','BACKUP_MAX_BYTES':'1000','BACKUP_PGSSLMODE':'disable','BACKUP_PRIVATE_NETWORK_APPROVED':'yes'}
    def test_inactive(self):
        with self.assertRaises(ValueError):guard({})
    def test_public_insecure_rejected(self):
        e=self.cfg();e['DATABASE_URL']='postgres://synthetic:synthetic@db.example:5432/synthetic'
        with self.assertRaises(ValueError):guard(e)
    def test_size_excess_rejected(self):
        e=self.cfg();e['BACKUP_MAX_BYTES']=str(257*1024*1024)
        with self.assertRaises(ValueError):guard(e)
    def test_deletion_rejected(self):
        e=self.cfg();e['BACKUP_RETENTION_DELETE']='yes'
        with self.assertRaises(ValueError):guard(e)
    def test_private_explicit(self):
        u,n=guard(self.cfg());self.assertEqual(n,1000)
        e=self.cfg();e['BACKUP_PRIVATE_NETWORK_APPROVED']='no'
        with self.assertRaises(ValueError):guard(e)
if __name__=='__main__':unittest.main()
