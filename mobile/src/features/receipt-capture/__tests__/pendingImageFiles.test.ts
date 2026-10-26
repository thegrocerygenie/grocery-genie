import { deletePendingImage, persistCapturedImage } from '../services/pendingImageFiles';

const mockCopy = jest.fn();
const mockDelete = jest.fn();
const mockCreate = jest.fn();
let mockExists = true;

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}${name}/`;
    }
    create(options: unknown) {
      mockCreate(options);
    }
  }
  class File {
    uri: string;
    constructor(base: string | { uri: string }, name?: string) {
      this.uri = typeof base === 'string' ? base : `${base.uri}${name}`;
    }
    get name() {
      return this.uri.split('/').pop();
    }
    get exists() {
      return mockExists;
    }
    copy(target: File) {
      mockCopy(this.uri, target.uri);
    }
    delete() {
      mockDelete(this.uri);
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///doc/' } } };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockExists = true;
});

describe('persistCapturedImage', () => {
  it('copies the camera photo out of the cache into documents', () => {
    const uri = persistCapturedImage('file:///cache/Camera/shot.jpg');

    expect(mockCreate).toHaveBeenCalledWith({ idempotent: true, intermediates: true });
    expect(uri).toMatch(/^file:\/\/\/doc\/pending-receipts\/\d+-shot\.jpg$/);
    expect(mockCopy).toHaveBeenCalledWith('file:///cache/Camera/shot.jpg', uri);
  });
});

describe('deletePendingImage', () => {
  it('deletes the queued photo', () => {
    deletePendingImage('file:///doc/pending-receipts/1-shot.jpg');

    expect(mockDelete).toHaveBeenCalledWith('file:///doc/pending-receipts/1-shot.jpg');
  });

  it('ignores a file that is already gone', () => {
    mockExists = false;

    expect(() => deletePendingImage('file:///doc/pending-receipts/gone.jpg')).not.toThrow();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('never throws, even when the delete fails', () => {
    mockDelete.mockImplementation(() => {
      throw new Error('EACCES');
    });

    expect(() => deletePendingImage('file:///doc/pending-receipts/1-shot.jpg')).not.toThrow();
  });
});
