DROP TABLE IF EXISTS dups;
CREATE TABLE dups (
  k TEXT NOT NULL,
  v TEXT
);
INSERT INTO dups VALUES ('dupkey', 'a'), ('dupkey', 'b');

DROP TABLE IF EXISTS contacts;
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT,
  qty INTEGER NOT NULL DEFAULT 0
);

INSERT INTO contacts (id, name, status) VALUES ('c_ok', 'Alice', 'active');
INSERT INTO contacts (id, name, status) VALUES ('c_partial', NULL, 'pending');
INSERT INTO contacts (id, name, status) VALUES ('c_bad', 'Bob', 'wrong');
INSERT INTO contacts (id, name, status) VALUES ('c_side', 'Side', 'active');
INSERT INTO contacts (id, name, status) VALUES ('c_multi_pass_a', 'Alice2', 'active');
INSERT INTO contacts (id, name, status) VALUES ('c_multi_pass_b', 'Bob2', 'active');
INSERT INTO contacts (id, name, status) VALUES ('c_multi_partial_ok', 'PartialPrimary', 'active');
