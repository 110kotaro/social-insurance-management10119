import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, Timestamp } from '@angular/fire/firestore';
import { Employee } from '../models/employee.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class EmployeeService {
  private firestore = inject(Firestore);

  /**
   * オブジェクトから再帰的にundefinedを削除（Firestore用）
   */
  private removeUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeUndefinedValues(item));
    }
    
    if (typeof obj === 'object' && obj.constructor === Object) {
      const cleaned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          if (value !== undefined) {
            cleaned[key] = this.removeUndefinedValues(value);
          }
        }
      }
      return cleaned;
    }
    
    return obj;
  }

  /**
   * 社員を作成
   */
  async createEmployee(employee: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const employeeRef = doc(collection(this.firestore, `${environment.firestorePrefix}employees`));
    const now = new Date();
    
    const employeeData: any = {
      employeeNumber: employee.employeeNumber,
      name: employee.name,
      nameKana: employee.nameKana,
      email: employee.email,
      departmentId: employee.departmentId,
      joinDate: employee.joinDate,
      birthDate: employee.birthDate,
      status: employee.status,
      organizationId: employee.organizationId,
      createdAt: now,
      updatedAt: now
    };

    // undefinedでない値のみ追加
    if (employee.dependentInfo !== undefined) {
      employeeData.dependentInfo = employee.dependentInfo;
    }
    if (employee.insuranceInfo !== undefined) {
      employeeData.insuranceInfo = employee.insuranceInfo;
    }
    if (employee.otherCompanyInfo !== undefined) {
      employeeData.otherCompanyInfo = employee.otherCompanyInfo;
    }
    if (employee.address !== undefined) {
      employeeData.address = employee.address;
    }

    // undefinedを再帰的に削除
    const cleanedData = this.removeUndefinedValues(employeeData);
    await setDoc(employeeRef, cleanedData);

    return employeeRef.id;
  }

  /**
   * 複数の社員を一括作成
   */
  async createEmployees(employees: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<string[]> {
    const promises = employees.map(emp => this.createEmployee(emp));
    return Promise.all(promises);
  }

  /**
   * 社員を更新
   */
  async updateEmployee(employeeId: string, employee: Partial<Employee>): Promise<void> {
    const employeeRef = doc(this.firestore, `${environment.firestorePrefix}employees`, employeeId);
    const updateData: any = {
      ...employee,
      updatedAt: new Date()
    };

    // id, createdAt, updatedAtを除外
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // undefinedを再帰的に削除
    const cleanedData = this.removeUndefinedValues(updateData);
    await updateDoc(employeeRef, cleanedData);
  }

  /**
   * 社員を取得
   */
  async getEmployee(employeeId: string): Promise<Employee | null> {
    const employeeRef = doc(this.firestore, `${environment.firestorePrefix}employees`, employeeId);
    const employeeSnap = await getDoc(employeeRef);

    if (!employeeSnap.exists()) {
      return null;
    }

    const data = employeeSnap.data();
    return this.convertToEmployee(data, employeeId);
  }

  /**
   * 組織の全社員を取得
   */
  async getEmployeesByOrganization(organizationId: string): Promise<Employee[]> {
    const employeesRef = collection(this.firestore, `${environment.firestorePrefix}employees`);
    const q = query(employeesRef, where('organizationId', '==', organizationId));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => this.convertToEmployee(doc.data(), doc.id));
  }

  /**
   * 部署の社員を取得
   */
  async getEmployeesByDepartment(departmentId: string): Promise<Employee[]> {
    const employeesRef = collection(this.firestore, `${environment.firestorePrefix}employees`);
    const q = query(employeesRef, where('departmentId', '==', departmentId));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => this.convertToEmployee(doc.data(), doc.id));
  }

  /**
   * 社員を削除
   */
  async deleteEmployee(employeeId: string): Promise<void> {
    const employeeRef = doc(this.firestore, `${environment.firestorePrefix}employees`, employeeId);
    await deleteDoc(employeeRef);
  }

  /**
   * メールアドレスで社員を検索（organizationIdなし）
   */
  async getEmployeeByEmail(email: string): Promise<Employee | null> {
    const employeesRef = collection(this.firestore, `${environment.firestorePrefix}employees`);
    const q = query(employeesRef, where('email', '==', email));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      return this.convertToEmployee(snapshot.docs[0].data(), snapshot.docs[0].id);
    }
    
    return null;
  }

  /**
   * 既存社員をチェック（社員番号またはメールアドレスで検索）
   */
  async checkEmployeeExists(employeeNumber: string, email: string, organizationId: string): Promise<Employee | null> {
    const employeesRef = collection(this.firestore, `${environment.firestorePrefix}employees`);
    
    // 社員番号で検索
    const q1 = query(
      employeesRef,
      where('employeeNumber', '==', employeeNumber),
      where('organizationId', '==', organizationId)
    );
    const snapshot1 = await getDocs(q1);
    
    if (!snapshot1.empty) {
      return this.convertToEmployee(snapshot1.docs[0].data(), snapshot1.docs[0].id);
    }
    
    // メールアドレスで検索
    const q2 = query(
      employeesRef,
      where('email', '==', email),
      where('organizationId', '==', organizationId)
    );
    const snapshot2 = await getDocs(q2);
    
    if (!snapshot2.empty) {
      return this.convertToEmployee(snapshot2.docs[0].data(), snapshot2.docs[0].id);
    }
    
    return null;
  }

  /**
   * FirestoreのTimestampまたはDateをDateオブジェクトに変換するヘルパー関数
   * Emulatorと本番環境の両方に対応
   */
  private convertToDate(value: any): Date | null {
    if (!value) {
      return null;
    }
    // 既にDateオブジェクトの場合はそのまま返す
    if (value instanceof Date) {
      return value;
    }
    // Timestampオブジェクトの場合はtoDate()を呼び出す
    if (value && typeof value.toDate === 'function') {
      return value.toDate();
    }
    // その他の場合はnullを返す
    return null;
  }

  /**
   * FirestoreのデータをEmployeeオブジェクトに変換
   */
  private convertToEmployee(data: any, id: string): Employee {
    // dependentInfoのbirthDateを変換
    let dependentInfo = data['dependentInfo'];
    if (dependentInfo && Array.isArray(dependentInfo)) {
      dependentInfo = dependentInfo.map((dep: any) => ({
        ...dep,
        birthDate: this.convertToDate(dep.birthDate) || dep.birthDate
      }));
    }

    // insuranceInfoのinsuranceStartDateを変換
    let insuranceInfo = data['insuranceInfo'];
    if (insuranceInfo) {
      insuranceInfo = {
        ...insuranceInfo,
        insuranceStartDate: insuranceInfo.insuranceStartDate 
          ? (this.convertToDate(insuranceInfo.insuranceStartDate) || insuranceInfo.insuranceStartDate)
          : insuranceInfo.insuranceStartDate
      };
    }

    return {
      id,
      employeeNumber: data['employeeNumber'],
      name: data['name'],
      nameKana: data['nameKana'],
      email: data['email'],
      departmentId: data['departmentId'],
      joinDate: this.convertToDate(data['joinDate']) || data['joinDate'],
      birthDate: this.convertToDate(data['birthDate']) || data['birthDate'],
      status: data['status'],
      dependentInfo: dependentInfo,
      insuranceInfo: insuranceInfo,
      otherCompanyInfo: data['otherCompanyInfo'],
      address: data['address'],
      organizationId: data['organizationId'],
      role: data['role'] || 'employee', // デフォルト: 'employee'
      invitationEmailSent: data['invitationEmailSent'],
      emailVerified: data['emailVerified'],
      createdAt: this.convertToDate(data['createdAt']) || new Date(),
      updatedAt: this.convertToDate(data['updatedAt']) || new Date()
    };
  }
}

