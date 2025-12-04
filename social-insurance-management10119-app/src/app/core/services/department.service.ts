import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, Timestamp } from '@angular/fire/firestore';
import { Department } from '../models/department.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class DepartmentService {
  private firestore = inject(Firestore);

  /**
   * 部署を作成
   */
  async createDepartment(department: Omit<Department, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const deptRef = doc(collection(this.firestore, `${environment.firestorePrefix}departments`));
    const now = new Date();
    
    const deptData: any = {
      name: department.name,
      organizationId: department.organizationId,
      createdAt: now,
      updatedAt: now
    };

    // undefinedでない値のみ追加
    if (department.code !== undefined) {
      deptData.code = department.code;
    }
    if (department.parentDepartmentId !== undefined) {
      deptData.parentDepartmentId = department.parentDepartmentId;
    }
    if (department.managerId !== undefined) {
      deptData.managerId = department.managerId;
    }
    if (department.email !== undefined) {
      deptData.email = department.email;
    }

    await setDoc(deptRef, deptData);

    return deptRef.id;
  }

  /**
   * 複数の部署を一括作成
   */
  async createDepartments(departments: Omit<Department, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<string[]> {
    const promises = departments.map(dept => this.createDepartment(dept));
    return Promise.all(promises);
  }

  /**
   * 組織の部署一覧を取得
   */
  async getDepartmentsByOrganization(organizationId: string): Promise<Department[]> {
    const q = query(
      collection(this.firestore, `${environment.firestorePrefix}departments`),
      where('organizationId', '==', organizationId)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data['createdAt']?.toDate() || new Date(),
        updatedAt: data['updatedAt']?.toDate() || new Date()
      } as Department;
    });
  }

  /**
   * 部署を取得
   */
  async getDepartment(departmentId: string): Promise<Department | null> {
    const deptRef = doc(this.firestore, `${environment.firestorePrefix}departments`, departmentId);
    const deptDoc = await getDoc(deptRef);
    
    if (!deptDoc.exists()) {
      return null;
    }
    
    const data = deptDoc.data();
    return {
      id: deptDoc.id,
      ...data,
      createdAt: data['createdAt']?.toDate() || new Date(),
      updatedAt: data['updatedAt']?.toDate() || new Date()
    } as Department;
  }

  /**
   * 部署を更新
   */
  async updateDepartment(departmentId: string, department: Partial<Department>): Promise<void> {
    const deptRef = doc(this.firestore, `${environment.firestorePrefix}departments`, departmentId);
    const updateData: any = {
      ...department,
      updatedAt: new Date()
    };

    // id, createdAt, updatedAtを除外
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // undefinedを削除
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    await updateDoc(deptRef, updateData);
  }

  /**
   * 部署を削除
   */
  async deleteDepartment(departmentId: string): Promise<void> {
    const deptRef = doc(this.firestore, `${environment.firestorePrefix}departments`, departmentId);
    await deleteDoc(deptRef);
  }
}

